import {
  recordRateLimitDecision,
  getRateLimitSnapshot,
  rateLimitDecisions,
  register,
  __resetRateLimitSnapshot,
} from '../../src/services/metrics';

describe('rate limit metrics (issue #371)', () => {
  beforeEach(() => {
    __resetRateLimitSnapshot();
  });

  it('starts with an empty snapshot', () => {
    expect(getRateLimitSnapshot()).toEqual([]);
  });

  it('records an allowed decision', () => {
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'allowed');

    const snapshot = getRateLimitSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      endpoint: '/api/v1/flights/search',
      tier: 'public',
      allowed: 1,
      blocked: 0,
      lastBlockedAt: null,
    });
  });

  it('records a blocked decision and sets lastBlockedAt', () => {
    recordRateLimitDecision('/api/v1/bookings', 'user', 'blocked');

    const snapshot = getRateLimitSnapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].blocked).toBe(1);
    expect(snapshot[0].allowed).toBe(0);
    expect(snapshot[0].lastBlockedAt).toEqual(expect.any(String));
    expect(new Date(snapshot[0].lastBlockedAt!).toString()).not.toBe('Invalid Date');
  });

  it('accumulates counts per endpoint+tier key without cross-contamination', () => {
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'allowed');
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'allowed');
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'blocked');
    recordRateLimitDecision('/api/v1/flights/search', 'premium', 'allowed');
    recordRateLimitDecision('/api/v1/bookings', 'public', 'blocked');

    const snapshot = getRateLimitSnapshot();
    expect(snapshot).toHaveLength(3);

    const searchPublic = snapshot.find(
      (e) => e.endpoint === '/api/v1/flights/search' && e.tier === 'public'
    );
    expect(searchPublic).toMatchObject({ allowed: 2, blocked: 1 });

    const searchPremium = snapshot.find(
      (e) => e.endpoint === '/api/v1/flights/search' && e.tier === 'premium'
    );
    expect(searchPremium).toMatchObject({ allowed: 1, blocked: 0 });

    const bookingsPublic = snapshot.find((e) => e.endpoint === '/api/v1/bookings');
    expect(bookingsPublic).toMatchObject({ allowed: 0, blocked: 1 });
  });

  it('increments the Prometheus counter alongside the snapshot', async () => {
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'allowed');
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'blocked');

    const metricsText = await register.getSingleMetricAsString(rateLimitDecisions.name);
    expect(metricsText).toContain('endpoint="/api/v1/flights/search"');
    expect(metricsText).toContain('outcome="allowed"');
    expect(metricsText).toContain('outcome="blocked"');
  });

  it('reset clears the snapshot for the next test', () => {
    recordRateLimitDecision('/api/v1/flights/search', 'public', 'allowed');
    __resetRateLimitSnapshot();
    expect(getRateLimitSnapshot()).toEqual([]);
  });
});
