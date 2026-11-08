import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

/**
 * Topics a portal page can subscribe to. A page only receives events for the topics it asked for:
 *  - `summary`      dashboard: "headline numbers changed, refetch" hints (coalesced)
 *  - `positions`    live map: last-known position/status patches for every pump (coalesced per pump)
 *  - `devices`      pump & tracker list: row patches, pump created/updated/deleted, unregistered trackers
 *  - `device:<id>`  one pump's detail page: its patches, every new position fix, its payments
 */
export type LiveTopic = 'summary' | 'positions' | 'devices' | `device:${string}`;

export interface LiveEvent {
  type: string;
  topics: string[];
  data: unknown;
}

/** Partial update of a pump's "last known" state, applied in place by the portal. */
export interface DevicePatch {
  id: string;
  serialNumber?: string;
  latitude?: number;
  longitude?: number;
  lastSeenAt?: string;
  lastFixAt?: string;
  speedKph?: number | null;
  batteryLevel?: number | null;
  withinGeofence?: boolean | null;
  distanceFromFarmMeters?: number | null;
  online?: boolean;
}

/** Device patches are merged per pump and flushed at most this often. */
const DEVICE_FLUSH_MS = 2_000;
/** "Summary changed" hints are sent at most this often. */
const SUMMARY_FLUSH_MS = 5_000;

/**
 * In-process event bus for live portal updates (single backend instance). Services call the publish
 * methods after a change is saved; the SSE controller filters the stream per connection by topic.
 * Rapid tracker traffic is coalesced here so a pump reporting every few seconds causes at most one
 * patch per DEVICE_FLUSH_MS, and the dashboard refetches at most once per SUMMARY_FLUSH_MS.
 */
@Injectable()
export class LiveEventsService implements OnModuleDestroy {
  private readonly bus = new Subject<LiveEvent>();
  private readonly pendingPatches = new Map<string, DevicePatch>();
  private summaryDirty = false;
  private readonly timers = [
    setInterval(() => this.flushPatches(), DEVICE_FLUSH_MS),
    setInterval(() => this.flushSummary(), SUMMARY_FLUSH_MS),
  ];

  /** Every event; the SSE controller filters by the topics each connection subscribed to. */
  get events$(): Observable<LiveEvent> {
    return this.bus.asObservable();
  }

  onModuleDestroy() {
    this.timers.forEach(clearInterval);
    this.bus.complete();
  }

  /** A pump's last-known state changed (new fix or heartbeat). Merged with pending patches for that pump. */
  devicePatch(patch: DevicePatch, opts: { summaryChanged?: boolean } = {}) {
    const prev = this.pendingPatches.get(patch.id);
    this.pendingPatches.set(patch.id, { ...prev, ...patch });
    if (opts.summaryChanged) this.summaryDirty = true;
  }

  /** A new stored position fix — only the pump's own detail page receives every fix. */
  devicePosition(deviceId: string, point: Record<string, unknown>) {
    this.emit('device.position', [`device:${deviceId}`], { deviceId, point });
  }

  /** A pump was registered, edited, re-assigned or deleted. */
  deviceChanged(deviceId: string, action: 'created' | 'updated' | 'deleted') {
    this.emit('device.changed', ['devices', 'positions', `device:${deviceId}`], { id: deviceId, action });
    this.summaryDirty = true;
  }

  /** A tracker that is not registered yet connected (or its attempt counter changed). */
  unregisteredTracker(imei: string) {
    this.emit('tracker.unregistered', ['devices'], { imei });
  }

  /** A payment was recorded or reversed. */
  paymentChanged(deviceId: string, paymentId: string, action: 'created' | 'reversed') {
    this.emit('payment.changed', ['devices', `device:${deviceId}`], { deviceId, paymentId, action });
    this.summaryDirty = true;
  }

  /** A farmer was created, edited or deleted (names show on pump rows and map popups). */
  farmerChanged(farmerId: string, action: 'created' | 'updated' | 'deleted') {
    this.emit('farmer.changed', ['devices', 'positions'], { id: farmerId, action });
    this.summaryDirty = true;
  }

  private emit(type: string, topics: string[], data: unknown) {
    this.bus.next({ type, topics, data });
  }

  private flushPatches() {
    if (!this.pendingPatches.size) return;
    const patches = [...this.pendingPatches.values()];
    this.pendingPatches.clear();
    for (const p of patches) this.emit('device.live', ['positions', 'devices', `device:${p.id}`], p);
  }

  private flushSummary() {
    if (!this.summaryDirty) return;
    this.summaryDirty = false;
    this.emit('summary.changed', ['summary'], {});
  }
}
