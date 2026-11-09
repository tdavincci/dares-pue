import { odysseyEndpoint, summarize } from './api-access-log.middleware';

describe('access log summaries', () => {
  it('recognises the Odyssey endpoints only', () => {
    expect(odysseyEndpoint('/api/v1/odyssey/standard/meter/readings')).toBe('readings');
    expect(odysseyEndpoint('/api/v1/odyssey/standard/electricity/payments')).toBe('payments');
    expect(odysseyEndpoint('/api/v1/odyssey/standard/token-renewal')).toBe('token-renewal');
    expect(odysseyEndpoint('/api/v1/odyssey/standard/swagger-ui')).toBeNull();
  });

  it('counts records and notes the total when paged', () => {
    expect(summarize('readings', 200, { readings: [1, 2], total: 10, errors: [] })).toMatchObject({
      success: true,
      recordCount: 2,
      total: 10,
      summary: '2 readings (of 10)',
    });
    expect(summarize('payments', 200, { payments: [1], total: 1, errors: '' }).summary).toBe('1 payment');
  });

  it('keeps the error message for failures', () => {
    const r = summarize('payments', 400, { payments: [], errors: 'x', message: ['FROM is required', 'TO is required'] });
    expect(r).toMatchObject({ success: false, recordCount: null, error: 'FROM is required; TO is required' });
    expect(summarize('readings', 401, { message: 'Invalid or missing authorization token' }).error).toBe(
      'Invalid or missing authorization token',
    );
  });

  it('summarises token renewal without the token', () => {
    const r = summarize('token-renewal', 200, { accessToken: 'dpue_at_secret', expiresIn: 86400 });
    expect(r.summary).toBe('Access token issued, expires in 86400 s');
    expect(JSON.stringify(r)).not.toContain('secret');
  });
});
