import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { haversineMeters, isValidCoordinate } from '../common/utils/geo';
import { sha256 } from '../common/utils/crypto';
import { Device, DeviceStatus } from '../devices/device.entity';
import { LiveEventsService } from '../live/live-events.service';
import { LocationPing, LocationSource } from './location-ping.entity';

export interface IncomingFix {
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKph?: number | null;
  course?: number | null;
  altitude?: number | null;
  satellites?: number | null;
  gpsValid?: boolean;
  batteryLevel?: number | null;
}

export type RecordResult =
  | { stored: true; pingId: string; withinGeofence: boolean | null; distanceFromFarmMeters: number | null }
  | {
      stored: false;
      reason: 'invalid_coordinates' | 'no_fix' | 'duplicate' | 'future_timestamp' | 'device_decommissioned';
    };

export interface UnknownTracker {
  imei: string;
  source: LocationSource;
  remoteAddress?: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  attempts: number;
}

/** How often pumps that stopped reporting are announced as offline to the portal. */
const OFFLINE_SWEEP_MS = 30_000;

/** Central write path for tracker positions: validation, geofence verdict, last-known state. */
@Injectable()
export class LocationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LocationsService.name);
  private readonly unknown = new Map<string, UnknownTracker>();
  /**
   * Last activity of every pump currently online, to spot offline → online transitions cheaply and to announce
   * online → offline ones (nothing arrives when a tracker goes quiet, so a timer checks).
   */
  private readonly lastActivity = new Map<string, number>();
  private sweepTimer?: ReturnType<typeof setInterval>;

  constructor(
    @InjectRepository(LocationPing) private readonly pings: Repository<LocationPing>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly config: ConfigService,
    private readonly live: LiveEventsService,
  ) {}

  private get onlineThresholdMs() {
    return (this.config.get<number>('tracking.onlineThresholdMinutes') ?? 30) * 60_000;
  }

  async onModuleInit() {
    // Pumps that were online before a restart still need to be announced when they go quiet.
    try {
      const recent = await this.devices.find({
        select: { id: true, lastSeenAt: true },
        where: { lastSeenAt: MoreThan(new Date(Date.now() - this.onlineThresholdMs)) },
      });
      for (const d of recent) if (d.lastSeenAt && !this.lastActivity.has(d.id)) this.lastActivity.set(d.id, d.lastSeenAt.getTime());
    } catch (e) {
      this.logger.warn(`Could not load online pumps: ${(e as Error).message}`);
    }
    this.sweepTimer = setInterval(() => this.sweepOffline(), OFFLINE_SWEEP_MS);
  }

  onModuleDestroy() {
    clearInterval(this.sweepTimer);
  }

  /** Tells the portal about pumps whose last report is now older than the online threshold. */
  sweepOffline(now = Date.now()) {
    for (const [id, last] of this.lastActivity) {
      if (now - last <= this.onlineThresholdMs) continue;
      this.lastActivity.delete(id);
      this.live.devicePatch({ id, online: false }, { summaryChanged: true });
    }
  }

  /** Records activity and returns true when the device was offline before this message. */
  private markActive(device: Device): boolean {
    const now = Date.now();
    const thresholdMs = this.onlineThresholdMs;
    const last = this.lastActivity.get(device.id) ?? (device.lastSeenAt ? device.lastSeenAt.getTime() : 0);
    this.lastActivity.set(device.id, now);
    return now - last > thresholdMs;
  }

  /**
   * GPS speed is unreliable when the tracker is still: indoors or under cover the position wanders a few metres
   * and the receiver reports that wobble as 5–10 km/h. Speeds below the threshold are stored as 0.
   */
  private cleanSpeed(speedKph: number | null | undefined): number | null {
    if (speedKph === undefined || speedKph === null) return null;
    const threshold = this.config.get<number>('tracking.stationarySpeedKph') ?? 0;
    return speedKph < threshold ? 0 : speedKph;
  }

  findDeviceByImei(imei: string) {
    return this.devices.findOne({ where: { trackerImei: imei }, relations: { farmer: true } });
  }

  async findDeviceByIngestKey(key: string) {
    return this.devices
      .createQueryBuilder('d')
      .leftJoinAndSelect('d.farmer', 'f')
      .where('d.ingestKeyHash = :h', { h: sha256(key) })
      .getOne();
  }

  async verifyIngestKey(deviceId: string, key: string | undefined): Promise<boolean> {
    if (!key) return false;
    const d = await this.devices
      .createQueryBuilder('d')
      .addSelect('d.ingestKeyHash')
      .where('d.id = :id', { id: deviceId })
      .getOne();
    return !!d?.ingestKeyHash && d.ingestKeyHash === sha256(key);
  }

  /** Remember IMEIs that talk to us but are not registered, so admins can register them. */
  noteUnknown(imei: string, source: LocationSource, remoteAddress?: string) {
    const now = new Date();
    const prev = this.unknown.get(imei);
    if (prev) {
      prev.lastSeenAt = now;
      prev.attempts++;
      prev.remoteAddress = remoteAddress ?? prev.remoteAddress;
    } else {
      this.unknown.set(imei, { imei, source, remoteAddress, firstSeenAt: now, lastSeenAt: now, attempts: 1 });
      this.logger.warn(`Unregistered tracker ${imei} via ${source}${remoteAddress ? ` from ${remoteAddress}` : ''}`);
      this.live.unregisteredTracker(imei);
    }
    if (this.unknown.size > 1000) {
      const oldest = [...this.unknown.values()].sort((a, b) => +a.lastSeenAt - +b.lastSeenAt)[0];
      this.unknown.delete(oldest.imei);
    }
  }

  listUnknown() {
    return [...this.unknown.values()].sort((a, b) => +b.lastSeenAt - +a.lastSeenAt);
  }

  forgetUnknown(imei: string) {
    if (this.unknown.delete(imei)) this.live.unregisteredTracker(imei);
  }

  /** Mark a device as seen (heartbeat) without a position. */
  async touch(device: Device, batteryLevel?: number | null) {
    const patch: Partial<Device> = { lastSeenAt: new Date() };
    if (batteryLevel !== undefined && batteryLevel !== null) patch.lastBatteryLevel = batteryLevel;
    await this.devices.update(device.id, patch);
    const cameOnline = this.markActive(device);
    this.live.devicePatch(
      {
        id: device.id,
        lastSeenAt: patch.lastSeenAt!.toISOString(),
        online: true,
        ...(patch.lastBatteryLevel !== undefined ? { batteryLevel: patch.lastBatteryLevel } : {}),
      },
      { summaryChanged: cameOnline },
    );
  }

  async record(device: Device, fix: IncomingFix, source: LocationSource): Promise<RecordResult> {
    if (device.status === DeviceStatus.DECOMMISSIONED) return { stored: false, reason: 'device_decommissioned' };
    if (!isValidCoordinate(fix.latitude, fix.longitude)) return { stored: false, reason: 'invalid_coordinates' };
    if (fix.gpsValid === false) {
      // No GPS lock: the coordinates are the last cached fix. Keep the device "seen" but don't store.
      await this.touch(device, fix.batteryLevel);
      return { stored: false, reason: 'no_fix' };
    }
    const now = Date.now();
    if (fix.recordedAt.getTime() > now + 10 * 60_000) return { stored: false, reason: 'future_timestamp' };

    const speedKph = this.cleanSpeed(fix.speedKph);
    let distance: number | null = null;
    let within: boolean | null = null;
    const farm = device.farmer;
    if (farm && farm.farmLatitude !== null && farm.farmLongitude !== null) {
      distance = Math.round(haversineMeters(farm.farmLatitude, farm.farmLongitude, fix.latitude, fix.longitude));
      within = distance <= device.geofenceRadiusMeters;
    }

    const insert = await this.pings
      .createQueryBuilder()
      .insert()
      .into(LocationPing)
      .values({
        deviceId: device.id,
        recordedAt: fix.recordedAt,
        latitude: fix.latitude,
        longitude: fix.longitude,
        speedKph,
        course: fix.course ?? null,
        altitude: fix.altitude ?? null,
        satellites: fix.satellites ?? null,
        gpsValid: true,
        batteryLevel: fix.batteryLevel ?? null,
        source,
        distanceFromFarmMeters: distance,
        withinGeofence: within,
      })
      .orIgnore()
      .returning(['id'])
      .execute();

    const id = insert.raw?.[0]?.id as string | undefined;
    if (!id) return { stored: false, reason: 'duplicate' };

    // Only move the "last known" position forward in time (trackers flush buffered points out of order).
    const advanced = await this.devices
      .createQueryBuilder()
      .update(Device)
      .set({
        lastSeenAt: () => 'now()',
        lastFixAt: fix.recordedAt,
        lastLatitude: fix.latitude,
        lastLongitude: fix.longitude,
        lastSpeedKph: speedKph,
        lastDistanceFromFarmMeters: distance,
        lastWithinGeofence: within,
        ...(fix.batteryLevel !== undefined && fix.batteryLevel !== null ? { lastBatteryLevel: fix.batteryLevel } : {}),
      })
      .where('id = :id', { id: device.id })
      .andWhere('(last_fix_at IS NULL OR last_fix_at <= :t)', { t: fix.recordedAt })
      .execute();
    await this.devices
      .createQueryBuilder()
      .update(Device)
      .set({ lastSeenAt: () => 'now()' })
      .where('id = :id', { id: device.id })
      .execute();

    this.publishFix(device, String(id), fix, source, speedKph, distance, within, !!advanced.affected);

    if (within === false) {
      this.logger.warn(
        `Device ${device.serialNumber} is ${distance} m from its farm (limit ${device.geofenceRadiusMeters} m)`,
      );
    }
    return { stored: true, pingId: String(id), withinGeofence: within, distanceFromFarmMeters: distance };
  }

  /** Last geofence state per device seen by this process (the cached Device entity can be stale). */
  private readonly lastWithin = new Map<string, boolean | null>();

  private publishFix(
    device: Device,
    pingId: string,
    fix: IncomingFix,
    source: LocationSource,
    speedKph: number | null,
    distance: number | null,
    within: boolean | null,
    advancedLastKnown: boolean,
  ) {
    const cameOnline = this.markActive(device);
    const now = new Date().toISOString();
    // The detail page gets every stored fix, including late (buffered) ones, for its history table.
    this.live.devicePosition(device.id, {
      id: pingId,
      recordedAt: fix.recordedAt.toISOString(),
      receivedAt: now,
      latitude: fix.latitude,
      longitude: fix.longitude,
      speedKph,
      batteryLevel: fix.batteryLevel ?? null,
      satellites: fix.satellites ?? null,
      source,
      distanceFromFarmMeters: distance,
      withinGeofence: within,
    });
    if (!advancedLastKnown) {
      // An older buffered fix: the last-known position did not change, only "last seen".
      this.live.devicePatch({ id: device.id, lastSeenAt: now, online: true }, { summaryChanged: cameOnline });
      return;
    }
    const previousWithin = this.lastWithin.has(device.id) ? this.lastWithin.get(device.id) : device.lastWithinGeofence;
    this.lastWithin.set(device.id, within);
    this.live.devicePatch(
      {
        id: device.id,
        latitude: fix.latitude,
        longitude: fix.longitude,
        lastFixAt: fix.recordedAt.toISOString(),
        lastSeenAt: now,
        speedKph,
        ...(fix.batteryLevel !== undefined && fix.batteryLevel !== null ? { batteryLevel: fix.batteryLevel } : {}),
        withinGeofence: within,
        distanceFromFarmMeters: distance,
        online: true,
      },
      // Dashboard counts only change when a pump comes online or crosses its farm boundary.
      { summaryChanged: cameOnline || previousWithin !== within },
    );
  }
}
