import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { haversineMeters } from '../common/utils/geo';
import { toE164 } from '../common/utils/phone';
import { OdysseyService } from './odyssey.service';

describe('OdysseyService.parseRange', () => {
  const cfg = configuration();
  const config = { get: (k: string) => k.split('.').reduce((o: any, p) => o?.[p], cfg) } as unknown as ConfigService;
  const svc = new OdysseyService({} as DataSource, config);

  it('accepts the Odyssey example format', () => {
    const r = svc.parseRange({ from: '2024-01-01T00:00:00Z', to: '2024-01-01T23:59:59Z' });
    expect(r.from.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('accepts milliseconds and offsets', () => {
    expect(() => svc.parseRange({ from: '2024-01-01T00:00:00.000Z', to: '2024-01-01T01:00:00+01:00' })).not.toThrow();
  });

  it.each([
    [{ to: '2024-01-01T00:00:00Z' }],
    [{ from: '2024-01-01', to: '2024-01-02' }],
    [{ from: '2024-01-02T00:00:00Z', to: '2024-01-01T00:00:00Z' }],
    [{ from: '2020-01-01T00:00:00Z', to: '2024-01-01T00:00:00Z' }],
  ])('rejects %j', (q) => {
    expect(() => svc.parseRange(q)).toThrow(BadRequestException);
  });
});

describe('haversineMeters', () => {
  it('is ~111 km per degree of latitude', () => {
    expect(haversineMeters(9, 12, 10, 12)).toBeGreaterThan(110_000);
    expect(haversineMeters(9, 12, 10, 12)).toBeLessThan(112_000);
  });
});

describe('OdysseyService contract rules', () => {
  const cfg = configuration();
  const config = { get: (k: string) => k.split('.').reduce((o: any, p) => o?.[p], cfg) } as unknown as ConfigService;
  const svc = new OdysseyService({} as DataSource, config);

  it('maps payment types onto the Odyssey transactionType enum', () => {
    expect(svc.transactionType('FULL_PAYMENT')).toBe('FULL_PAYMENT');
    expect(svc.transactionType('INSTALLMENT')).toBe('INSTALLMENT_PAYMENT');
  });

  it('returns a payments-shaped 400 body (errors as a string)', () => {
    try {
      svc.parseRange({ to: '2024-01-01T00:00:00Z' }, 'payments');
      fail('should throw');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as any;
      expect(body.payments).toEqual([]);
      expect(typeof body.errors).toBe('string');
      expect(body.errors).toContain('FROM is required');
    }
  });

  it('returns a readings-shaped 400 body (errors as an array)', () => {
    try {
      svc.parseRange({ from: 'yesterday', to: '2024-01-01T00:00:00Z' }, 'readings');
      fail('should throw');
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as any;
      expect(body.readings).toEqual([]);
      expect(Array.isArray(body.errors)).toBe(true);
    }
  });
});

describe('toE164', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+234 803 123 4567', '+2348031234567'],
    ['8031234567', '+2348031234567'],
    ['', undefined],
  ])('%s -> %s', (input, out) => {
    expect(toE164(input)).toBe(out);
  });
});
