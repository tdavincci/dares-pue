import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './api.service';
import { AuthService } from './auth';

/** Topics match the backend (backend/src/live/live-events.service.ts). Subscribe only to what the page shows. */
export type LiveTopic = 'summary' | 'positions' | 'devices' | 'api' | `device:${string}`;

/**
 * Messages delivered to a page. `resync` is emitted after the stream reconnects: events sent while it was
 * down were missed, so the page should reload its data once.
 */
export interface LiveMessage<T = any> {
  type:
    | 'resync'
    | 'device.live'
    | 'device.position'
    | 'device.changed'
    | 'tracker.unregistered'
    | 'payment.changed'
    | 'farmer.changed'
    | 'summary.changed'
    | 'api.access'
    | string;
  data: T;
}

/** Patch of a pump's last-known state (`device.live`). Only the fields that changed are present. */
export interface DevicePatch {
  id: string;
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

const MAX_BACKOFF_MS = 30_000;

/**
 * Live updates over Server-Sent Events. The stream is opened with fetch() so the login token travels in the
 * Authorization header (EventSource can't send headers, and tokens must not go in URLs). Each call to
 * `stream()` is one connection that lives as long as the subscription; it reconnects with backoff.
 */
@Injectable({ providedIn: 'root' })
export class LiveService {
  private auth = inject(AuthService);
  private readonly openStreams = signal(0);
  private readonly wantedStreams = signal(0);

  /** 'live' when every stream a page asked for is connected, 'connecting' while any is (re)connecting. */
  readonly state = computed<'idle' | 'live' | 'connecting'>(() => {
    if (!this.wantedStreams()) return 'idle';
    return this.openStreams() >= this.wantedStreams() ? 'live' : 'connecting';
  });

  stream(topics: LiveTopic[]): Observable<LiveMessage> {
    return new Observable<LiveMessage>((sub) => {
      let stopped = false;
      let open = false;
      let everConnected = false;
      let attempt = 0;
      let abort: AbortController | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      this.wantedStreams.update((n) => n + 1);

      const setOpen = (v: boolean) => {
        if (v === open) return;
        open = v;
        this.openStreams.update((n) => n + (v ? 1 : -1));
      };

      const scheduleRetry = () => {
        if (stopped) return;
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++) + Math.random() * 500;
        retryTimer = setTimeout(connect, delay);
      };

      const connect = async () => {
        const token = this.auth.token();
        if (!token) return scheduleRetry();
        abort = new AbortController();
        try {
          const res = await fetch(`${API_BASE}/admin/live/stream?topics=${encodeURIComponent(topics.join(','))}`, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            cache: 'no-store',
            signal: abort.signal,
          });
          if (res.status === 401) {
            this.auth.logout();
            return;
          }
          if (!res.ok || !res.body) throw new Error(`Live stream HTTP ${res.status}`);

          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value.replace(/\r\n/g, '\n');
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const msg = parseEvent(buffer.slice(0, end));
              buffer = buffer.slice(end + 2);
              if (!msg || msg.type === 'ping') continue;
              if (msg.type === 'ready') {
                attempt = 0;
                setOpen(true);
                if (everConnected) sub.next({ type: 'resync', data: {} });
                everConnected = true;
                continue;
              }
              sub.next(msg);
            }
          }
        } catch {
          // network error or abort: handled below
        }
        setOpen(false);
        scheduleRetry();
      };

      void connect();

      return () => {
        stopped = true;
        clearTimeout(retryTimer);
        abort?.abort();
        setOpen(false);
        this.wantedStreams.update((n) => n - 1);
      };
    });
  }
}

/** Parses one SSE block ("event: x\ndata: {...}"). */
function parseEvent(block: string): LiveMessage | null {
  let type = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    const i = line.indexOf(':');
    const field = i < 0 ? line : line.slice(0, i);
    const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
    if (field === 'event') type = value;
    else if (field === 'data') data.push(value);
  }
  if (!data.length && type === 'message') return null;
  try {
    return { type, data: data.length ? JSON.parse(data.join('\n')) : {} };
  } catch {
    return null;
  }
}

/** Applies a `device.live` patch to a full pump record (pump list, detail page). */
export function patchDevice<T extends Record<string, any>>(d: T, p: DevicePatch): T {
  const next: Record<string, any> = { ...d };
  if (p.latitude !== undefined) next['lastLatitude'] = p.latitude;
  if (p.longitude !== undefined) next['lastLongitude'] = p.longitude;
  if (p.lastSeenAt !== undefined) next['lastSeenAt'] = p.lastSeenAt;
  if (p.lastFixAt !== undefined) next['lastFixAt'] = p.lastFixAt;
  if (p.speedKph !== undefined) next['lastSpeedKph'] = p.speedKph;
  if (p.batteryLevel !== undefined) next['lastBatteryLevel'] = p.batteryLevel;
  if (p.withinGeofence !== undefined) next['lastWithinGeofence'] = p.withinGeofence;
  if (p.distanceFromFarmMeters !== undefined) next['lastDistanceFromFarmMeters'] = p.distanceFromFarmMeters;
  if (p.online !== undefined) next['online'] = p.online;
  return next as T;
}

/** Applies a `device.live` patch to a live-map entry (field names without the `last` prefix). */
export function patchMapDevice<T extends Record<string, any>>(d: T, p: DevicePatch): T {
  const next: Record<string, any> = { ...d };
  for (const k of ['latitude', 'longitude', 'lastSeenAt', 'speedKph', 'batteryLevel', 'withinGeofence', 'distanceFromFarmMeters', 'online'] as const) {
    if (p[k] !== undefined) next[k] = p[k];
  }
  return next as T;
}
