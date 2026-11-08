import { BadRequestException } from '@nestjs/common';
import { LiveEvent, LiveEventsService } from './live-events.service';
import { parseTopics } from './live.controller';

describe('LiveEventsService', () => {
  let svc: LiveEventsService;
  let seen: LiveEvent[];

  beforeEach(() => {
    jest.useFakeTimers();
    svc = new LiveEventsService();
    seen = [];
    svc.events$.subscribe((e) => seen.push(e));
  });

  afterEach(() => {
    svc.onModuleDestroy();
    jest.useRealTimers();
  });

  it('merges rapid patches for one pump into a single event per flush', () => {
    svc.devicePatch({ id: 'a', latitude: 1, longitude: 1, batteryLevel: 80 });
    svc.devicePatch({ id: 'a', latitude: 2, longitude: 2 });
    svc.devicePatch({ id: 'b', lastSeenAt: 'x' });
    expect(seen).toHaveLength(0);
    jest.advanceTimersByTime(2_000);
    const live = seen.filter((e) => e.type === 'device.live');
    expect(live).toHaveLength(2);
    expect(live.find((e) => (e.data as any).id === 'a')!.data).toEqual({ id: 'a', latitude: 2, longitude: 2, batteryLevel: 80 });
    expect(live[0].topics).toEqual(expect.arrayContaining(['positions', 'devices', 'device:a']));
  });

  it('only hints the dashboard when something it counts changed, at most every 5 s', () => {
    svc.devicePatch({ id: 'a', latitude: 1, longitude: 1 }); // routine fix: no summary hint
    jest.advanceTimersByTime(5_000);
    expect(seen.some((e) => e.type === 'summary.changed')).toBe(false);

    svc.devicePatch({ id: 'a', withinGeofence: false }, { summaryChanged: true });
    svc.paymentChanged('a', 'p1', 'created');
    jest.advanceTimersByTime(5_000);
    expect(seen.filter((e) => e.type === 'summary.changed')).toHaveLength(1);
  });

  it('sends each new fix only to that pump\'s topic', () => {
    svc.devicePosition('a', { id: '1' });
    expect(seen[0]).toMatchObject({ type: 'device.position', topics: ['device:a'] });
  });
});

describe('parseTopics', () => {
  it('accepts known topics and pump topics', () => {
    expect([...parseTopics('summary, positions,device:6f1c2a7e-1b2c-4d5e-8f90-123456789abc')]).toHaveLength(3);
  });

  it.each([undefined, '', 'everything', 'device:not-a-uuid'])('rejects %p', (raw) => {
    expect(() => parseTopics(raw)).toThrow(BadRequestException);
  });
});
