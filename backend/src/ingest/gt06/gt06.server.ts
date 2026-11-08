import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createServer, Server, Socket } from 'net';
import { Device } from '../../devices/device.entity';
import { LocationSource } from '../../locations/location-ping.entity';
import { LocationsService } from '../../locations/locations.service';
import {
  buildAck,
  decodeAlarmStatus,
  decodeGps,
  decodeLoginImei,
  decodeStatus,
  extractFrames,
  Gt06Frame,
  Gt06Proto,
  isGpsProtocol,
  needsAck,
} from './gt06.codec';

interface Session {
  imei?: string;
  device?: Device | null;
  deviceLoadedAt?: number;
  buffer: Buffer;
  battery?: number | null;
  remote: string;
  reportedUnknownData?: boolean;
}

const MAX_BUFFER = 16 * 1024;
const DEVICE_CACHE_MS = 60_000;

/** TCP listener for GT06-family car trackers. Point the tracker at SERVER_IP:GT06_PORT. */
@Injectable()
export class Gt06Server implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger('GT06');
  private server?: Server;
  private readonly sockets = new Set<Socket>();

  constructor(
    private readonly config: ConfigService,
    private readonly locations: LocationsService,
  ) {}

  get port(): number | undefined {
    const addr = this.server?.address();
    return addr && typeof addr === 'object' ? addr.port : undefined;
  }

  async onModuleInit() {
    if (!this.config.get<boolean>('tracking.gt06Enabled')) return;
    const port = this.config.get<number>('tracking.gt06Port')!;
    const idle = this.config.get<number>('tracking.gt06IdleTimeoutSeconds')! * 1000;
    this.server = createServer((socket) => this.onConnection(socket, idle));
    this.server.on('error', (e) => this.logger.error(`GT06 server error: ${e.message}`));
    await new Promise<void>((resolve) => this.server!.listen(port, '0.0.0.0', resolve));
    this.logger.log(`GT06 tracker listener on tcp://0.0.0.0:${this.port}`);
  }

  async onApplicationShutdown() {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
  }

  private onConnection(socket: Socket, idleMs: number) {
    const session: Session = { buffer: Buffer.alloc(0), remote: `${socket.remoteAddress}:${socket.remotePort}` };
    this.sockets.add(socket);
    socket.setTimeout(idleMs);
    socket.setKeepAlive(true, 60_000);
    this.logger.log(`Connection from ${session.remote}`);
    socket.on('timeout', () => socket.destroy());
    socket.on('error', (e) => {
      this.logger.warn(`Socket error from ${session.imei ?? session.remote}: ${e.message}`);
      socket.destroy();
    });
    socket.on('close', () => {
      this.sockets.delete(socket);
      this.logger.log(`Disconnected ${session.imei ?? session.remote}${session.imei ? '' : ' (never logged in)'}`);
    });

    // Process chunks sequentially to keep per-device ordering.
    let chain = Promise.resolve();
    socket.on('data', (chunk) => {
      chain = chain
        .then(() => this.onData(socket, session, chunk))
        .catch((e) => {
          this.logger.error(`Error handling data from ${session.imei ?? session.remote}: ${e?.message ?? e}`);
        });
    });
  }

  private async onData(socket: Socket, s: Session, chunk: Buffer) {
    s.buffer = Buffer.concat([s.buffer, chunk]);
    if (s.buffer.length > MAX_BUFFER) {
      this.logger.warn(`Dropping oversized buffer from ${s.remote}`);
      s.buffer = Buffer.alloc(0);
      return;
    }
    // A tracker speaking another protocol (or plain HTTP from a browser) never sends a GT06 start marker.
    // Log the first bytes once per connection so the sender can be identified from the server logs.
    if (!s.imei && !s.reportedUnknownData && s.buffer.length >= 2) {
      const head = s.buffer.subarray(0, 2).toString('hex');
      if (head !== '7878' && head !== '7979') {
        s.reportedUnknownData = true;
        const sample = s.buffer.subarray(0, 48);
        this.logger.warn(
          `Non-GT06 data from ${s.remote}: hex=${sample.toString('hex')} text=${JSON.stringify(sample.toString('latin1'))}`,
        );
      }
    }
    const { frames, rest } = extractFrames(s.buffer);
    s.buffer = rest;
    for (const f of frames) {
      if (!f.crcOk) {
        this.logger.warn(`Bad CRC from ${s.imei ?? s.remote} (proto 0x${f.protocol.toString(16)})`);
        continue;
      }
      await this.handleFrame(socket, s, f);
      if (needsAck(f.protocol) && !socket.destroyed) socket.write(buildAck(f));
    }
  }

  private async loadDevice(s: Session) {
    if (!s.imei) return null;
    if (s.device !== undefined && s.deviceLoadedAt && Date.now() - s.deviceLoadedAt < DEVICE_CACHE_MS) return s.device;
    s.device = await this.locations.findDeviceByImei(s.imei);
    s.deviceLoadedAt = Date.now();
    if (!s.device) this.locations.noteUnknown(s.imei, LocationSource.GT06, s.remote);
    return s.device;
  }

  private async handleFrame(socket: Socket, s: Session, f: Gt06Frame) {
    if (f.protocol === Gt06Proto.LOGIN) {
      const imei = decodeLoginImei(f.content);
      if (!imei) return;
      s.imei = imei;
      s.device = undefined;
      const device = await this.loadDevice(s);
      this.logger.log(`Login ${imei} from ${s.remote}${device ? ` → ${device.serialNumber}` : ' (unregistered)'}`);
      if (device) await this.locations.touch(device);
      return;
    }

    const device = await this.loadDevice(s);
    if (!device) return; // not logged in, or unknown tracker — ACK anyway so it keeps the line up

    if (f.protocol === Gt06Proto.STATUS || f.protocol === Gt06Proto.HEARTBEAT_2) {
      const st = decodeStatus(f.content);
      s.battery = st.batteryLevel;
      await this.locations.touch(device, st.batteryLevel);
      return;
    }

    if (isGpsProtocol(f.protocol)) {
      if (f.protocol === Gt06Proto.ALARM || f.protocol === Gt06Proto.GPS_LBS_3) {
        const st = decodeAlarmStatus(f.content);
        if (st?.batteryLevel !== null && st?.batteryLevel !== undefined) s.battery = st.batteryLevel;
      }
      const pos = decodeGps(f.content, this.config.get<number>('tracking.gt06TimeOffsetMinutes'));
      if (!pos) return;
      const res = await this.locations.record(
        device,
        {
          recordedAt: pos.recordedAt,
          latitude: pos.latitude,
          longitude: pos.longitude,
          speedKph: pos.speedKph,
          course: pos.course,
          satellites: pos.satellites,
          gpsValid: pos.gpsValid,
          batteryLevel: s.battery ?? null,
        },
        LocationSource.GT06,
      );
      if (!res.stored && res.reason !== 'duplicate' && res.reason !== 'no_fix') {
        this.logger.debug(`Discarded fix from ${device.serialNumber}: ${res.reason}`);
      }
    }
  }
}
