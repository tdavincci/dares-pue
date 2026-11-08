import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { formatCoord } from '../common/utils/geo';
import { toE164 } from '../common/utils/phone';
import {
  ODYSSEY_TRANSACTION_TYPES,
  OdysseyMeter,
  OdysseyMeterResponse,
  OdysseyPayment,
  OdysseyPaymentResponse,
  OdysseyTransactionType,
} from './dto/odyssey.dto';

export interface RangeQuery {
  from?: string;
  to?: string;
  id?: string;
  offset?: string;
  pageLimit?: string;
  /** Optional Odyssey filters. FINANCING_ID is applied; SITE_ID and COUNTRY are accepted (see filterNote). */
  financingId?: string;
  siteId?: string;
  country?: string;
}

type Dataset = 'readings' | 'payments';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/;

/** Countries this deployment serves. A COUNTRY filter for any other country returns no rows. */
const SERVED_COUNTRIES = new Set(['NG', 'NGA', 'NIGERIA']);

/** Removes undefined/null/'' keys so optional fields are omitted rather than sent as null. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as T;
}

/**
 * 400 response that still follows the dataset's contract: an empty result list plus `errors`
 * (an array for readings, a string for payments), alongside Nest's usual statusCode/message.
 */
function invalid(dataset: Dataset, errors: string[]): BadRequestException {
  const body =
    dataset === 'readings'
      ? { readings: [], errors, statusCode: 400, message: errors }
      : { payments: [], errors: errors.join('; '), statusCode: 400, message: errors };
  return new BadRequestException(body);
}

@Injectable()
export class OdysseyService {
  constructor(
    private readonly ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  parseRange(q: RangeQuery, dataset: Dataset = 'readings') {
    const errors: string[] = [];
    if (!q.from) errors.push('FROM is required (ISO 8601 UTC, e.g. 2024-01-01T00:00:00Z)');
    if (!q.to) errors.push('TO is required (ISO 8601 UTC, e.g. 2024-01-02T00:00:00Z)');
    if (q.from && !ISO_UTC.test(q.from)) errors.push("FROM must be ISO 8601 UTC (yyyy-MM-dd'T'HH:mm:ss'Z')");
    if (q.to && !ISO_UTC.test(q.to)) errors.push("TO must be ISO 8601 UTC (yyyy-MM-dd'T'HH:mm:ss'Z')");
    if (errors.length) throw invalid(dataset, errors);
    const from = new Date(q.from!);
    const to = new Date(q.to!);
    if (isNaN(+from) || isNaN(+to)) throw invalid(dataset, ['FROM/TO are not valid dates']);
    if (from > to) throw invalid(dataset, ['FROM must be earlier than or equal to TO']);
    const maxHours = this.config.get<number>('odyssey.maxRangeHours')!;
    if (maxHours > 0 && (+to - +from) / 3600_000 > maxHours) {
      throw invalid(dataset, [`Requested range exceeds the maximum of ${maxHours} hours`]);
    }
    return { from, to };
  }

  private parsePaging(q: RangeQuery, dataset: Dataset) {
    const offset = q.offset === undefined || q.offset === '' ? 0 : Number(q.offset);
    if (!Number.isInteger(offset) || offset < 0) throw invalid(dataset, ['offset must be a non-negative integer']);
    const max = this.config.get<number>('odyssey.maxPageLimit')!;
    const def = this.config.get<number>('odyssey.defaultPageLimit')!;
    let pageLimit: number;
    if (q.pageLimit === undefined || q.pageLimit === '') pageLimit = def > 0 ? def : max;
    else {
      pageLimit = Number(q.pageLimit);
      if (!Number.isInteger(pageLimit) || pageLimit < 1) throw invalid(dataset, ['pageLimit must be a positive integer']);
    }
    return { offset, pageLimit: Math.min(pageLimit, max) };
  }

  /** true when a COUNTRY filter names a country this deployment does not serve (→ empty result). */
  private excludedByCountry(q: RangeQuery) {
    return !!q.country && !SERVED_COUNTRIES.has(q.country.trim().toUpperCase());
  }

  async readings(q: RangeQuery): Promise<OdysseyMeterResponse> {
    const { from, to } = this.parseRange(q, 'readings');
    const { offset, pageLimit } = this.parsePaging(q, 'readings');
    if (this.excludedByCountry(q)) return { readings: [], offset, pageLimit, total: 0, errors: [] };
    const bucketMin = this.config.get<number>('odyssey.readingIntervalMinutes')!;
    const bucketSec = Math.max(0, bucketMin) * 60;

    const params: unknown[] = [from, to];
    const filters: string[] = [];
    if (q.id) {
      params.push(q.id);
      filters.push(`(d.serial_number = $${params.length} OR d.tracker_imei = $${params.length})`);
    }
    if (q.financingId) {
      params.push(q.financingId);
      filters.push(`d.financing_id = $${params.length}`);
    }
    const base = `
      SELECT l.id, l.device_id, l.recorded_at, l.latitude, l.longitude,
             d.serial_number, d.financing_id, d.report_interval_minutes,
             f.account_number, f.full_name, f.phone, f.category
        FROM location_pings l
        JOIN devices d ON d.id = l.device_id
   LEFT JOIN farmers f ON f.id = d.farmer_id
       WHERE l.recorded_at >= $1 AND l.recorded_at <= $2 ${filters.map((f) => `AND ${f}`).join(' ')}`;

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
        // Required by the Meter Metrics contract. Pump GPS trackers do not meter energy, so this is always 0.
        energyConsumptionKwh: 0,
        timeIntervalMinutes: bucketMin > 0 ? bucketMin : r.report_interval_minutes,
        // Required by the contract; pumps not yet assigned to a farmer have no account.
        customerAccountId: r.account_number ?? 'N/A',
        customerPhone: toE164(r.phone),
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

  /**
   * Payment events in the window, one row per transaction event:
   *  - every recorded payment at its paid_at time, including payments that were later reversed, so a window
   *    returns the same rows on every re-pull (Odyssey backfills and re-verifies historical windows);
   *  - one REVERSAL event at reversed_at for each reversed payment, with its own stable transactionId
   *    (`<original transactionId>-REV`).
   */
  async payments(q: RangeQuery): Promise<OdysseyPaymentResponse> {
    const { from, to } = this.parseRange(q, 'payments');
    const { offset, pageLimit } = this.parsePaging(q, 'payments');
    if (this.excludedByCountry(q)) return { payments: [], errors: '', offset, pageLimit, total: 0 };

    const params: unknown[] = [from, to];
    const filters: string[] = [];
    // ID matches a pump (serial / IMEI) on both event kinds, or exactly one event's transactionId.
    let paymentIdFilter = '';
    let reversalIdFilter = '';
    if (q.id) {
      params.push(q.id);
      const i = `$${params.length}`;
      paymentIdFilter = `AND (p.transaction_id = ${i} OR d.serial_number = ${i} OR d.tracker_imei = ${i})`;
      reversalIdFilter = `AND (p.transaction_id || '-REV' = ${i} OR d.serial_number = ${i} OR d.tracker_imei = ${i})`;
    }
    if (q.financingId) {
      params.push(q.financingId);
      filters.push(`d.financing_id = $${params.length}`);
    }
    const where = filters.map((f) => `AND ${f}`).join(' ');
    const cols = `p.transaction_id, p.amount, p.currency, p.payment_type, p.recorded_by_id,
                  d.serial_number, d.financing_id, d.last_latitude, d.last_longitude,
                  f.id AS farmer_id, f.account_number, f.full_name, f.phone, f.category,
                  f.farm_latitude, f.farm_longitude`;
    const from_ = `FROM payments p JOIN devices d ON d.id = p.device_id JOIN farmers f ON f.id = p.farmer_id`;
    const events = `
      SELECT ${cols}, p.paid_at AS event_at, false AS is_reversal ${from_}
       WHERE p.paid_at >= $1 AND p.paid_at <= $2 ${paymentIdFilter} ${where}
      UNION ALL
      SELECT ${cols}, p.reversed_at AS event_at, true AS is_reversal ${from_}
       WHERE p.status = 'REVERSED' AND p.reversed_at IS NOT NULL
         AND p.reversed_at >= $1 AND p.reversed_at <= $2 ${reversalIdFilter} ${where}`;

    const [{ total }] = await this.ds.query(`SELECT count(*)::int AS total FROM (${events}) e`, params);
    const rows: any[] = await this.ds.query(
      `SELECT * FROM (${events}) e ORDER BY e.event_at ASC, e.transaction_id ASC, e.is_reversal ASC
       OFFSET ${offset} LIMIT ${pageLimit}`,
      params,
    );

    const negativeReversals = this.config.get<boolean>('odyssey.reversalNegativeAmount') !== false;
    const payments: OdysseyPayment[] = rows.map((r) => {
      const amount = Number(r.amount);
      return compact({
        timestamp: new Date(r.event_at).toISOString(),
        amount: r.is_reversal && negativeReversals ? -amount : amount,
        currency: r.currency,
        transactionType: r.is_reversal ? 'REVERSAL' : this.transactionType(r.payment_type),
        transactionId: r.is_reversal ? `${r.transaction_id}-REV` : r.transaction_id,
        serialNumber: r.serial_number ?? 'N/A',
        meterId: r.serial_number,
        customerId: r.farmer_id ?? 'N/A',
        customerAccountId: r.account_number,
        customerName: r.full_name,
        customerPhone: toE164(r.phone),
        customerCategory: r.category,
        agentId: r.recorded_by_id,
        financingId: r.financing_id,
        latitude: formatCoord(r.farm_latitude ?? r.last_latitude),
        longitude: formatCoord(r.farm_longitude ?? r.last_longitude),
      });
    });
    return { payments, errors: '', offset, pageLimit, total };
  }

  /** Maps our payment types onto Odyssey's transactionType enum (never sends an unsupported value). */
  transactionType(paymentType: string): OdysseyTransactionType {
    if (paymentType === 'INSTALLMENT') return 'INSTALLMENT_PAYMENT';
    const configured = this.config.get<string>('odyssey.paymentTransactionType') as OdysseyTransactionType;
    return ODYSSEY_TRANSACTION_TYPES.includes(configured) ? configured : 'FULL_PAYMENT';
  }
}
