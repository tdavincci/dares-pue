import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiAccessLogService } from './api-access-log.service';
import type { ValidatedClient } from './api-clients.service';

/** `apiClient` is set by ApiTokenGuard (data endpoints) or by the token-renewal handler. */
type LoggedRequest = Request & { apiClient?: Partial<ValidatedClient> };

const MAX_ERROR = 1000;

/** The Odyssey endpoint a path belongs to, or null for anything else (e.g. Swagger UI). */
export function odysseyEndpoint(path: string): string | null {
  if (/\/meter\/readings\/?$/.test(path)) return 'readings';
  if (/\/electricity\/payments\/?$/.test(path)) return 'payments';
  if (/\/token-renewal\/?$/.test(path)) return 'token-renewal';
  return null;
}

/** Turns an Odyssey response body into the counts and one-line summary stored in the history. */
export function summarize(
  endpoint: string,
  statusCode: number,
  body: any,
): { success: boolean; recordCount: number | null; total: number | null; summary: string; error: string | null } {
  const success = statusCode < 400;
  if (!success) {
    const msg = body?.message ?? body?.errors ?? body?.error ?? `HTTP ${statusCode}`;
    const error = (Array.isArray(msg) ? msg.join('; ') : String(msg)).slice(0, MAX_ERROR);
    return { success, recordCount: null, total: null, summary: error.slice(0, 300), error };
  }
  if (endpoint === 'token-renewal') {
    return {
      success,
      recordCount: null,
      total: null,
      summary: `Access token issued, expires in ${body?.expiresIn ?? '?'} s`,
      error: null,
    };
  }
  const list: unknown[] | undefined = endpoint === 'readings' ? body?.readings : body?.payments;
  const recordCount = Array.isArray(list) ? list.length : null;
  const total = typeof body?.total === 'number' ? body.total : null;
  const noun = endpoint === 'readings' ? 'reading' : 'payment';
  const n = recordCount ?? 0;
  let summary = `${n} ${noun}${n === 1 ? '' : 's'}`;
  if (total !== null && total !== n) summary += ` (of ${total})`;
  return { success, recordCount, total, summary, error: null };
}

/**
 * Records every request to the Odyssey Standard API after the response is sent: who called (client and token
 * prefix, once the guard has identified them), the URL, status, number of records returned or the error message.
 * Runs as middleware so requests rejected by the token guard are recorded too. Tokens are never stored.
 */
@Injectable()
export class ApiAccessLogMiddleware implements NestMiddleware {
  constructor(private readonly logs: ApiAccessLogService) {}

  use(req: LoggedRequest, res: Response, next: NextFunction) {
    const endpoint = odysseyEndpoint(req.path);
    if (!endpoint) return next();
    const started = Date.now();
    let body: unknown;
    const json = res.json.bind(res);
    res.json = (b: unknown) => {
      body = b;
      return json(b);
    };
    res.on('finish', () => {
      const r = summarize(endpoint, res.statusCode, body);
      this.logs.record({
        clientId: req.apiClient?.clientId ?? null,
        tokenPrefix: req.apiClient?.tokenPrefix ?? null,
        method: req.method,
        endpoint,
        url: req.originalUrl.slice(0, 1000),
        statusCode: res.statusCode,
        ...r,
        durationMs: Date.now() - started,
        ip: (req.ip ?? null)?.slice(0, 64) ?? null,
        userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
      });
    });
    next();
  }
}
