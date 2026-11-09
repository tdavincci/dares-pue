import { BadRequestException, Controller, Header, MessageEvent, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { filter, interval, map, merge, Observable, of, takeUntil, timer } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LiveEventsService } from './live-events.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATIC_TOPICS = new Set(['summary', 'positions', 'devices', 'api']);
/** Keep-alive so proxies (Railway, nginx) don't close an idle stream. */
const PING_MS = 25_000;
/** Streams end after this long; the portal reconnects, which re-checks the login token. */
const MAX_STREAM_MS = 60 * 60_000;

export function parseTopics(raw: string | undefined): Set<string> {
  const topics = new Set(
    (raw ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );
  if (!topics.size) throw new BadRequestException('topics is required, e.g. ?topics=positions');
  if (topics.size > 10) throw new BadRequestException('At most 10 topics per stream');
  for (const t of topics) {
    const ok = STATIC_TOPICS.has(t) || (t.startsWith('device:') && UUID.test(t.slice('device:'.length)));
    if (!ok) throw new BadRequestException(`Unknown topic "${t}"`);
  }
  return topics;
}

@ApiTags('Admin · Live updates')
@ApiBearerAuth('admin-jwt')
@UseGuards(JwtAuthGuard)
@SkipThrottle()
@Controller('admin/live')
export class LiveController {
  constructor(private readonly live: LiveEventsService) {}

  @Sse('stream')
  @Header('X-Accel-Buffering', 'no') // tell nginx-style proxies not to buffer the stream
  @ApiOperation({
    summary: 'Server-Sent Events stream of live updates for the admin portal',
    description:
      'Send `Authorization: Bearer <admin JWT>` (the portal opens the stream with fetch, not EventSource, so the ' +
      'token never goes in the URL). Subscribe only to what the page shows: `summary` (dashboard), `positions` ' +
      '(live map), `devices` (pump & tracker list), `device:<uuid>` (one pump). Event types: `ready`, `ping`, ' +
      '`device.live` (patch of a pump\'s last-known state, at most every 2 s per pump), `device.position` (new fix, ' +
      'device topic only), `device.changed`, `tracker.unregistered`, `payment.changed`, `farmer.changed`, ' +
      '`summary.changed` (at most every 5 s). Streams close after an hour; reconnect.',
  })
  @ApiQuery({ name: 'topics', required: true, example: 'positions', description: 'Comma-separated topics' })
  @ApiProduces('text/event-stream')
  stream(@Query('topics') rawTopics?: string): Observable<MessageEvent> {
    const topics = parseTopics(rawTopics);
    const events = this.live.events$.pipe(
      filter((e) => e.topics.some((t) => topics.has(t))),
      map((e): MessageEvent => ({ type: e.type, data: e.data as object })),
    );
    const pings = interval(PING_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: {} })));
    const ready = of<MessageEvent>({ type: 'ready', data: { topics: [...topics] } });
    return merge(ready, events, pings).pipe(takeUntil(timer(MAX_STREAM_MS)));
  }
}
