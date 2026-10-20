const { SearchCacheSLO } = require('../src/cache_slo');

describe('SearchCacheSLO', () => {
  test('should initialize with zero counts and meet SLO by default', () => {
    const slo = new SearchCacheSLO(0.85);
    const metrics = slo.getMetrics();
    expect(metrics.hits).toBe(0);
    expect(metrics.misses).toBe(0);
    expect(metrics.hitRate).toBe(0.0);
    expect(metrics.sloMet).toBe(true);
  });

  test('should calculate hit rate correctly and pass SLO when above target', () => {
    const slo = new SearchCacheSLO(0.80);
    slo.recordHit();
    slo.recordHit();
    slo.recordHit();
    slo.recordMiss();
    const metrics = slo.getMetrics();
    expect(metrics.hits).toBe(3);
    expect(metrics.misses).toBe(1);
    expect(metrics.total).toBe(4);
    expect(metrics.hitRate).toBe(0.75); // Wait, let's make it >= 0.80
    slo.recordHit();
    slo.recordHit();
    const updated = slo.getMetrics();
    expect(updated.hitRate).toBe(5 / 6);
    expect(updated.sloMet).toBe(true);
  });

  test('failure mode: should fail SLO when hit rate drops below target', () => {
    const slo = new SearchCacheSLO(0.80);
    slo.recordHit();
    slo.recordMiss();
    slo.recordMiss();
    slo.recordMiss();
    const metrics = slo.getMetrics();
    expect(metrics.hitRate).toBe(0.25);
    expect(metrics.sloMet).toBe(false);
  });
});
