import { LocationsService } from './locations.service';

describe('LocationsService offline sweep', () => {
  const threshold = 30 * 60_000;
  const make = (recent: { id: string; lastSeenAt: Date }[]) => {
    const live = { devicePatch: jest.fn() };
    const devices = { find: jest.fn().mockResolvedValue(recent) };
    const config = { get: (k: string) => (k === 'tracking.onlineThresholdMinutes' ? 30 : undefined) };
    const svc = new LocationsService(null as any, devices as any, config as any, live as any);
    return { svc, live };
  };

  it('announces pumps that went quiet, once, and keeps the rest online', async () => {
    const now = Date.now();
    const { svc, live } = make([
      { id: 'quiet', lastSeenAt: new Date(now - threshold + 5_000) },
      { id: 'active', lastSeenAt: new Date(now - 60_000) },
    ]);
    await svc.onModuleInit();
    svc.sweepOffline(now);
    expect(live.devicePatch).not.toHaveBeenCalled();

    svc.sweepOffline(now + 10_000); // 'quiet' passes the threshold
    expect(live.devicePatch).toHaveBeenCalledTimes(1);
    expect(live.devicePatch).toHaveBeenCalledWith({ id: 'quiet', online: false }, { summaryChanged: true });

    svc.sweepOffline(now + 20_000); // not announced twice
    expect(live.devicePatch).toHaveBeenCalledTimes(1);
    svc.onModuleDestroy();
  });
});
