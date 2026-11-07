import {
  buildAck,
  buildFrame,
  crc16x25,
  decodeGps,
  decodeLoginImei,
  decodeStatus,
  encodeGps,
  encodeLogin,
  extractFrames,
} from './gt06.codec';

describe('GT06 codec', () => {
  it('computes CRC-16/X-25 (check value for "123456789" is 0x906E)', () => {
    expect(crc16x25(Buffer.from('123456789'))).toBe(0x906e);
  });

  it('decodes a reference login packet from the GT06 protocol document', () => {
    // 78 78 0D 01 01 23 45 67 89 01 23 45 00 01 8C DD 0D 0A
    const raw = Buffer.from('78780D01012345678901234500018CDD0D0A', 'hex');
    const { frames, rest } = extractFrames(raw);
    expect(rest.length).toBe(0);
    expect(frames).toHaveLength(1);
    expect(frames[0].crcOk).toBe(true);
    expect(frames[0].protocol).toBe(0x01);
    expect(frames[0].serial).toBe(1);
    expect(decodeLoginImei(frames[0].content)).toBe('123456789012345');
    // Reference login response: 78 78 05 01 00 01 D9 DC 0D 0A
    expect(buildAck(frames[0]).toString('hex').toUpperCase()).toBe('787805010001D9DC0D0A');
  });

  it('round-trips a GPS fix, including southern / western hemispheres', () => {
    const date = new Date(Date.UTC(2026, 10, 5, 12, 30, 15));
    for (const [lat, lon] of [
      [9.203512, 12.49541],
      [-33.9249, -18.4241],
    ]) {
      const frame = buildFrame(
        0x12,
        Buffer.concat([encodeGps({ date, lat, lon, speed: 12, course: 270 }), Buffer.alloc(8)]),
        7,
      );
      const [f] = extractFrames(frame).frames;
      const pos = decodeGps(f.content)!;
      expect(pos.recordedAt.toISOString()).toBe(date.toISOString());
      expect(pos.latitude).toBeCloseTo(lat, 5);
      expect(pos.longitude).toBeCloseTo(lon, 5);
      expect(pos.speedKph).toBe(12);
      expect(pos.course).toBe(270);
      expect(pos.gpsValid).toBe(true);
    }
  });

  it('handles frames split across TCP chunks and garbage between frames', () => {
    const a = buildFrame(0x01, encodeLogin('359339075123456'), 1);
    const b = buildFrame(0x13, Buffer.from([0x46, 0x06, 0x04, 0x00, 0x02]), 2);
    const stream = Buffer.concat([Buffer.from([0xff, 0x00]), a, b]);
    const first = extractFrames(stream.subarray(0, a.length + 5));
    expect(first.frames).toHaveLength(1);
    const second = extractFrames(Buffer.concat([first.rest, stream.subarray(a.length + 5)]));
    expect(second.frames).toHaveLength(1);
    expect(decodeStatus(second.frames[0].content).batteryLevel).toBe(100);
  });

  it('flags corrupted frames', () => {
    const f = buildFrame(0x13, Buffer.from([0x46, 0x05, 0x04, 0x00, 0x02]), 3);
    f[5] ^= 0xff;
    expect(extractFrames(f).frames[0].crcOk).toBe(false);
  });
});
