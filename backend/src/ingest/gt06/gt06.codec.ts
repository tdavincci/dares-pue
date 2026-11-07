/**
 * Minimal, dependency-free codec for the Concox GT06 binary protocol, used by most
 * low-cost vehicle/car GPS trackers (GT06, GT06N, TK100, JM01, WeTrack, ET200 …).
 *
 * Frame:  0x78 0x78 | len(1) | proto(1) | content | serial(2) | crc(2) | 0x0D 0x0A
 *    or:  0x79 0x79 | len(2) | proto(1) | content | serial(2) | crc(2) | 0x0D 0x0A
 * `len` counts proto + content + serial + crc. CRC is CRC-16/X-25 (CRC-ITU) over len..serial.
 */

export enum Gt06Proto {
  LOGIN = 0x01,
  GPS_LBS = 0x12,
  STATUS = 0x13, // heartbeat
  STRING = 0x15,
  ALARM = 0x16,
  LBS_PHONE = 0x17,
  GPS_PHONE = 0x1a,
  GPS_LBS_2 = 0x22,
  HEARTBEAT_2 = 0x23,
  GPS_LBS_3 = 0x26, // alarm, newer firmware
  GPS_LBS_EXT = 0x2d,
  GPS_LBS_4 = 0x37,
  TIME_REQUEST = 0x8a,
  INFO = 0x94,
}

/** Protocols whose content begins with a standard 18-byte GPS block. */
const GPS_PROTOCOLS = new Set([0x10, 0x11, 0x12, 0x16, 0x1a, 0x22, 0x26, 0x2d, 0x37]);
/** Protocols the device expects us to acknowledge. */
const ACK_PROTOCOLS = new Set([0x01, 0x13, 0x16, 0x23, 0x26, 0x8a]);

export interface Gt06Frame {
  protocol: number;
  content: Buffer;
  serial: number;
  extended: boolean;
  crcOk: boolean;
}

export interface Gt06Position {
  recordedAt: Date;
  latitude: number;
  longitude: number;
  speedKph: number;
  course: number;
  satellites: number;
  gpsValid: boolean;
}

export interface Gt06Status {
  batteryLevel: number | null; // %
  gsmSignal: number | null; // 0..4
  charging: boolean | null;
  accOn: boolean | null;
}

const CRC_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x8408 : c >>> 1;
    t[i] = c;
  }
  return t;
})();

export function crc16x25(buf: Buffer, start = 0, end = buf.length): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return ~crc & 0xffff;
}

/**
 * Pulls complete frames out of a TCP stream buffer.
 * Returns the frames and the unconsumed remainder (partial frame) to keep for the next chunk.
 */
export function extractFrames(buffer: Buffer): { frames: Gt06Frame[]; rest: Buffer } {
  const frames: Gt06Frame[] = [];
  let i = 0;
  while (i + 5 <= buffer.length) {
    const a = buffer[i];
    const b = buffer[i + 1];
    const extended = a === 0x79 && b === 0x79;
    if (!(extended || (a === 0x78 && b === 0x78))) {
      i++; // resync on garbage
      continue;
    }
    const headerLen = extended ? 4 : 3;
    if (i + headerLen > buffer.length) break;
    const len = extended ? buffer.readUInt16BE(i + 2) : buffer[i + 2];
    const total = headerLen + len + 2; // + stop bits
    if (len < 5) {
      i += 2;
      continue;
    }
    if (i + total > buffer.length) break; // wait for more data
    const frame = buffer.subarray(i, i + total);
    if (frame[total - 2] !== 0x0d || frame[total - 1] !== 0x0a) {
      i += 2;
      continue;
    }
    const lenStart = 2;
    const crcPos = total - 4;
    const crcOk = frame.readUInt16BE(crcPos) === crc16x25(frame, lenStart, crcPos);
    frames.push({
      protocol: frame[headerLen],
      content: Buffer.from(frame.subarray(headerLen + 1, crcPos - 2)),
      serial: frame.readUInt16BE(crcPos - 2),
      extended,
      crcOk,
    });
    i += total;
  }
  return { frames, rest: Buffer.from(buffer.subarray(i)) };
}

/** Build a frame (used for ACKs and by the simulator / tests). */
export function buildFrame(protocol: number, content: Buffer, serial: number, extended = false): Buffer {
  const len = 1 + content.length + 2 + 2;
  const header = extended ? Buffer.from([0x79, 0x79, (len >> 8) & 0xff, len & 0xff]) : Buffer.from([0x78, 0x78, len]);
  const body = Buffer.concat([
    header,
    Buffer.from([protocol]),
    content,
    Buffer.from([(serial >> 8) & 0xff, serial & 0xff]),
  ]);
  const crc = crc16x25(body, 2, body.length);
  return Buffer.concat([body, Buffer.from([(crc >> 8) & 0xff, crc & 0xff, 0x0d, 0x0a])]);
}

export function needsAck(protocol: number) {
  return ACK_PROTOCOLS.has(protocol);
}

export function buildAck(frame: Gt06Frame): Buffer {
  if (frame.protocol === Gt06Proto.TIME_REQUEST) {
    const n = new Date();
    const c = Buffer.from([
      n.getUTCFullYear() - 2000,
      n.getUTCMonth() + 1,
      n.getUTCDate(),
      n.getUTCHours(),
      n.getUTCMinutes(),
      n.getUTCSeconds(),
    ]);
    return buildFrame(frame.protocol, c, frame.serial, frame.extended);
  }
  return buildFrame(frame.protocol, Buffer.alloc(0), frame.serial, frame.extended);
}

/** IMEI from the 8-byte BCD terminal ID in a login packet. */
export function decodeLoginImei(content: Buffer): string | null {
  if (content.length < 8) return null;
  const hex = content.subarray(0, 8).toString('hex');
  const imei = hex.replace(/^0+/, '');
  return /^[0-9]{10,17}$/.test(imei) ? imei : null;
}

export function isGpsProtocol(protocol: number) {
  return GPS_PROTOCOLS.has(protocol);
}

/** Decode the standard GPS block found at the start of location/alarm packets. */
export function decodeGps(content: Buffer, timeOffsetMinutes = 0): Gt06Position | null {
  if (content.length < 18) return null;
  const [yy, mo, dd, hh, mi, ss] = content.subarray(0, 6);
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return null;
  const recordedAt = new Date(Date.UTC(2000 + yy, mo - 1, dd, hh, mi, ss) - timeOffsetMinutes * 60_000);
  const satellites = content[6] & 0x0f;
  let latitude = content.readUInt32BE(7) / 1_800_000;
  let longitude = content.readUInt32BE(11) / 1_800_000;
  const speedKph = content[15];
  const flags = content.readUInt16BE(16);
  const course = flags & 0x03ff;
  const gpsValid = (flags & (1 << 12)) !== 0;
  if ((flags & (1 << 10)) === 0) latitude = -latitude; // bit10: 1 = North
  if ((flags & (1 << 11)) !== 0) longitude = -longitude; // bit11: 1 = West
  return {
    recordedAt,
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
    speedKph,
    course,
    satellites,
    gpsValid,
  };
}

/** GT06 reports battery as a 0–6 voltage level; map it to an approximate percentage. */
const VOLTAGE_LEVEL_PCT = [0, 5, 10, 25, 50, 75, 100];

/** Decode heartbeat (0x13) content: terminal info, voltage level, GSM signal, alarm/lang. */
export function decodeStatus(content: Buffer): Gt06Status {
  if (content.length < 3) return { batteryLevel: null, gsmSignal: null, charging: null, accOn: null };
  const info = content[0];
  const level = content[1];
  return {
    accOn: (info & 0x02) !== 0,
    charging: (info & 0x04) !== 0,
    batteryLevel: level <= 6 ? VOLTAGE_LEVEL_PCT[level] : Math.min(100, level),
    gsmSignal: content[2],
  };
}

/** Status block appended after GPS (18) + LBS (len-prefixed) in alarm packets 0x16 / 0x26. */
export function decodeAlarmStatus(content: Buffer): Gt06Status | null {
  if (content.length < 18 + 1) return null;
  const lbsLen = content[18];
  const start = 18 + lbsLen;
  if (content.length < start + 3) return null;
  return decodeStatus(content.subarray(start));
}

/** Helpers for building test/simulator packets. */
export function encodeLogin(imei: string): Buffer {
  return Buffer.from(imei.padStart(16, '0'), 'hex');
}

export function encodeGps(p: {
  date: Date;
  lat: number;
  lon: number;
  speed?: number;
  course?: number;
  sats?: number;
  valid?: boolean;
}) {
  const b = Buffer.alloc(18);
  const d = p.date;
  b[0] = d.getUTCFullYear() - 2000;
  b[1] = d.getUTCMonth() + 1;
  b[2] = d.getUTCDate();
  b[3] = d.getUTCHours();
  b[4] = d.getUTCMinutes();
  b[5] = d.getUTCSeconds();
  b[6] = 0xc0 | ((p.sats ?? 8) & 0x0f);
  b.writeUInt32BE(Math.round(Math.abs(p.lat) * 1_800_000), 7);
  b.writeUInt32BE(Math.round(Math.abs(p.lon) * 1_800_000), 11);
  b[15] = p.speed ?? 0;
  let flags = (p.course ?? 0) & 0x03ff;
  if (p.valid !== false) flags |= 1 << 12;
  if (p.lat >= 0) flags |= 1 << 10;
  if (p.lon < 0) flags |= 1 << 11;
  b.writeUInt16BE(flags, 16);
  return b;
}
