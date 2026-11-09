import { parseCorsOrigins } from './configuration';

describe('parseCorsOrigins', () => {
  it('allows every origin by default', () => {
    expect(parseCorsOrigins(undefined)).toEqual(['*']);
    expect(parseCorsOrigins('  ')).toEqual(['*']);
  });

  it('accepts a comma-separated list and tolerates quotes, spaces and trailing slashes', () => {
    expect(parseCorsOrigins(' "https://honey.albashir.ng/", http://localhost:4200 ')).toEqual([
      'https://honey.albashir.ng',
      'http://localhost:4200',
    ]);
    expect(parseCorsOrigins("'https://a.example' https://b.example/")).toEqual(['https://a.example', 'https://b.example']);
  });
});
