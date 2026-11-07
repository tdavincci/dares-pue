import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { formatCoord } from '../common/utils/geo';
import { OdysseyMeter, OdysseyMeterResponse, OdysseyPayment, OdysseyPaymentResponse } from './dto/odyssey.dto';

export interface RangeQuery {
  from?: string;
  to?: string;
  id?: string;
  offset?: string;
  pageLimit?: string;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Removes undefined/null keys so optional fields are omitted rather than sent as null. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

@Injectable()
export class OdysseyService {
  constructor(
    private readonly ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  parseRange(q: RangeQuery) {
    const errors: string[] = [];
    if (!q.from) errors.push('FROM is required (ISO 8601 UTC, e.g. 2024-01-01T00:00:00Z)');
    if (!q.to) errors.push('TO is required (ISO 8601 UTC, e.g. 2024-01-31T23:59:59Z)');
    if (q.from && !ISO_UTC.test(q.from)) errors.push('FROM must be ISO 8601 with a timezone (YYYY-MM-DDTHH:MM:SSZ)');
    if (q.to && !ISO_UTC.test(q.to)) errors.push('TO must be ISO 8601 with a timezone (YYYY-MM-DDTHH:MM:SSZ)');
    if (errors.length) throw new BadRequestException(errors);
    const from = new Date(q.from!);
    const to = new Date(q.to!);
    if (isNaN(+from) || isNaN(+to)) throw new BadRequestException(['FROM/TO are not valid dates']);
    if (from > to) throw new BadRequestException(['FROM must be earlier than or equal to TO']);
    const maxHours = this.config.get<number>('odyssey.maxRangeHours')!;
    if (maxHours > 0 && (+to - +from) / 3600_000 > maxHours) {
      throw new BadRequestException([`Requested range exceeds the maximum of ${maxHours} hours`]);
    }
    return { from, to };
  }

  private parsePaging(q: RangeQuery) {
    const offset = q.offset === undefined || q.offset === '' ? 0 : Number(q.offset);
    if (!Number.isInteger(offset) || offset < 0)
      throw new BadRequestException(['offset must be a non-negative integer']);
    const max = this.config.get<number>('odyssey.maxPageLimit')!;
    const def = this.config.get<number>('odyssey.defaultPageLimit')!;
    let pageLimit: number;
    if (q.pageLimit === undefined || q.pageLimit === '') pageLimit = def > 0 ? def : max;
    else {
      pageLimit = Number(q.pageLimit);
      if (!Number.isInteger(pageLimit) || pageLimit < 1)
        throw new BadRequestException(['pageLimit must be a positive integer']);
    }
    return { offset, pageLimit: Math.min(pageLimit, max) };
  }

  async readings(q: RangeQuery): Promise<OdysseyMeterResponse> {
    const { from, to } = this.parseRange(q);
    const { offset, pageLimit } = this.parsePaging(q);
    const bucketMin = this.config.get<number>('odyssey.readingIntervalMinutes')!;
    const bucketSec = Math.max(0, bucketMin) * 60;

    const params: unknown[] = [from, to];
    let idFilter = '';
    if (q.id) {
      params.push(q.id);
      idFilter = `AND (d.serial_number = $${params.length} OR d.tracker_imei = $${params.length})`;
    }
    const base = `
      SELECT l.id, l.device_id, l.recorded_at, l.latitude, l.longitude,
             d.serial_number, d.financing_id, d.report_interval_minutes,
             f.account_number, f.full_name, f.phone, f.category
        FROM location_pings l
        JOIN devices d ON d.id = l.device_id
   LEFT JOIN farmers f ON f.id = d.farmer_id
       WHERE l.recorded_at >= $1 AND l.recorded_at <= $2 ${idFilter}`;

    // Down-sample: keep the latest fix per device per bucket.
    const sampled =
      bucketSec > 0
        ? `SELECT DISTINCT ON (b.device_id, floor(extract(epoch FROM b.recorded_at) / ${bucketSec})) b.*
             FROM (${base}) b
         ORDER BY b.device_id, floor(extract(epoch FROM b.recorded_at) / ${bucketSec}), b.recorded_at DESC`
        : base;

    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM (${sampled}) s`, params);
    const rows: any[] = await this.ds.query(
      `SELECT * FROM (${sampled}) s ORDER BY s.recorded_at ASC, s.id ASC OFFSET ${offset} LIMIT ${pageLimit}`,
      params,
    );

    const readings: OdysseyMeter[] = rows.map((r) =>
      compact({
        timestamp: new Date(r.recorded_at).toISOString(),
        meterId: r.serial_number,
        timeIntervalMinutes: bucketMin > 0 ? bucketMin : r.report_interval_minutes,
        customerAccountId: r.account_number,
        customerPhone: r.phone,
        readingId: String(r.id),
        financingId: r.financing_id,
        latitude: formatCoord(r.latitude),
        longitude: formatCoord(r.longitude),
        customerName: r.full_name,
        customerCategory: r.category,
      }),
    );
    return { readings, offset, pageLimit, total, errors: [] };
  }

  async payments(q: RangeQuery): Promise<OdysseyPaymentResponse> {
    const { from, to } = this.parseRange(q);
    const params: unknown[] = [from, to];
    let idFilter = '';
    if (q.id) {
      params.push(q.id);
      const i = `$${params.length}`;
      idFilter = `AND (p.transaction_id = ${i} OR d.serial_number = ${i} OR d.tracker_imei = ${i})`;
    }
    const rows: any[] = await this.ds.query(
      `SELECT p.transaction_id, p.amount, p.currency, p.payment_type, p.paid_at, p.recorded_by_id,
              d.serial_number, d.financing_id, d.last_latitude, d.last_longitude,
              f.id AS farmer_id, f.account_number, f.full_name, f.phone, f.category,
              f.farm_latitude, f.farm_longitude
         FROM payments p
         JOIN devices d ON d.id = p.device_id
         JOIN farmers f ON f.id = p.farmer_id
        WHERE p.status = 'COMPLETED' AND p.paid_at >= $1 AND p.paid_at <= $2 ${idFilter}
     ORDER BY p.paid_at ASC, p.transaction_id ASC`,
      params,
    );
    const fullType = this.config.get<string>('odyssey.paymentTransactionType')!;
    const payments: OdysseyPayment[] = rows.map((r) =>
      compact({
        timestamp: new Date(r.paid_at).toISOString(),
        amount: Number(r.amount),
        currency: r.currency,
        transactionType: r.payment_type === 'FULL_PAYMENT' ? fullType : r.payment_type,
        transactionId: r.transaction_id,
        serialNumber: r.serial_number,
        meterId: r.serial_number,
        customerPhone: r.phone,
        customerName: r.full_name,
        agentId: r.recorded_by_id,
        financingId: r.financing_id,
        latitude: formatCoord(r.farm_latitude ?? r.last_latitude),
        longitude: formatCoord(r.farm_longitude ?? r.last_longitude),
        customerAccountId: r.account_number,
        customerId: r.farmer_id,
        customerCategory: r.category,
      }),
    );
    return { payments, errors: '' };
  }
}
