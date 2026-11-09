import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Paged } from '../common/dto/pagination.dto';
import { LiveEventsService } from '../live/live-events.service';
import { ApiAccessLog } from './api-access-log.entity';

export type AccessLogEntry = Omit<ApiAccessLog, 'id' | 'createdAt' | 'client'>;

export interface AccessLogQuery {
  page: number;
  pageSize: number;
  clientId?: string;
  success?: boolean;
  endpoint?: string;
}

const PRUNE_EVERY_MS = 3600_000;

/** Stores the Odyssey request history shown on the portal's API access page. */
@Injectable()
export class ApiAccessLogService {
  private readonly log = new Logger(ApiAccessLogService.name);
  private readonly retentionDays: number;
  private lastPrune = 0;

  constructor(
    @InjectRepository(ApiAccessLog) private readonly repo: Repository<ApiAccessLog>,
    private readonly live: LiveEventsService,
    config: ConfigService,
  ) {
    this.retentionDays = config.get<number>('odyssey.accessLogRetentionDays') ?? 90;
  }

  /** Fire-and-forget: a logging failure must never affect the API response. */
  record(entry: AccessLogEntry) {
    void this.repo
      .save(this.repo.create(entry))
      .then((saved) => {
        this.live.apiAccess({ id: saved.id, clientId: saved.clientId, success: saved.success });
        return this.prune();
      })
      .catch((e: Error) => this.log.warn(`Could not store API access log: ${e.message}`));
  }

  async list(q: AccessLogQuery): Promise<Paged<ApiAccessLog & { clientName: string | null }>> {
    const qb = this.repo
      .createQueryBuilder('l')
      .leftJoin('l.client', 'c')
      .addSelect(['c.id', 'c.name'])
      .orderBy('l.createdAt', 'DESC')
      .skip((q.page - 1) * q.pageSize)
      .take(q.pageSize);
    if (q.clientId) qb.andWhere('l.clientId = :cid', { cid: q.clientId });
    if (q.success !== undefined) qb.andWhere('l.success = :ok', { ok: q.success });
    if (q.endpoint) qb.andWhere('l.endpoint = :ep', { ep: q.endpoint });
    const [rows, total] = await qb.getManyAndCount();
    const items = rows.map(({ client, ...l }) => ({ ...l, client: null, clientName: client?.name ?? null }));
    return { items, total, page: q.page, pageSize: q.pageSize };
  }

  private async prune() {
    if (this.retentionDays <= 0 || Date.now() - this.lastPrune < PRUNE_EVERY_MS) return;
    this.lastPrune = Date.now();
    const cutoff = new Date(Date.now() - this.retentionDays * 86400_000);
    await this.repo.delete({ createdAt: LessThan(cutoff) });
  }
}
