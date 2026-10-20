/**
 * Performance regression tests for CacheService (InMemoryCacheService).
 * Measures get/set/delete and read-through operations.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/services/metrics', () => ({
  recordCacheOperation: jest.fn(),
}));

describe('InMemoryCacheService Performance', () => {
  let InMemoryCacheService: any;
  let cache: any;

  beforeAll(() => {
    InMemoryCacheService = require('../../src/services/cacheService').InMemoryCacheService;
    cache = new InMemoryCacheService('perf-test');
  });

  beforeEach(async () => {
    await cache.del('*');
  });

  it('should set a value within 1ms', async () => {
    const stats = await measurePerf(
      () => cache.set('perf:key', { data: 'test-value', nested: { count: 42 } }, 300),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 1, maxMs: 5 });
  });

  it('should get a cached value (hit) within 1ms', async () => {
    await cache.set('perf:key', { data: 'test-value' }, 300);

    const stats = await measurePerf(() => cache.get('perf:key'), 25);
    assertPerfThresholds(stats, { meanMaxMs: 1, maxMs: 5 });
  });

  it('should return null for missing key (miss) within 1ms', async () => {
    const stats = await measurePerf(() => cache.get('perf:missing'), 25);
    assertPerfThresholds(stats, { meanMaxMs: 1, maxMs: 5 });
  });

  it('should delete a key within 1ms', async () => {
    await cache.set('perf:to-delete', 'value', 300);

    const stats = await measurePerf(() => cache.del('perf:to-delete'), 25);
    assertPerfThresholds(stats, { meanMaxMs: 1, maxMs: 5 });
  });

  it('should perform read-through (getOrSet) within 2ms', async () => {
    const fn = async () => ({ computed: 'expensive-result', at: Date.now() });

    const stats = await measurePerf(
      () => cache.getOrSet('perf:readthrough', 300, fn),
      25
    );
    assertPerfThresholds(stats, { meanMaxMs: 2, maxMs: 10 });
  });

  it('should handle large values (10KB) within 2ms', async () => {
    const largeValue = { data: 'x'.repeat(10_000) };

    const stats = await measurePerf(() => cache.set('perf:large', largeValue, 300), 25);
    assertPerfThresholds(stats, { meanMaxMs: 2, maxMs: 10 });
  });

  it('should handle concurrent get/set operations within 5ms each', async () => {
    const ops = async () => {
      await Promise.all([
        cache.set('perf:a', 1, 300),
        cache.set('perf:b', 2, 300),
        cache.get('perf:a'),
        cache.get('perf:b'),
        cache.set('perf:c', 3, 300),
      ]);
    };

    const stats = await measurePerf(ops, 20);
    assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 20 });
  });

  it('should invalidate prefix within 5ms', async () => {
    await Promise.all([
      cache.set('perf:a', 1, 300),
      cache.set('perf:b', 2, 300),
      cache.set('perf:c', 3, 300),
      cache.set('other:x', 4, 300),
    ]);

    const stats = await measurePerf(() => cache.invalidatePrefix('perf:'), 25);
    assertPerfThresholds(stats, { meanMaxMs: 5, maxMs: 15 });
  });
});
