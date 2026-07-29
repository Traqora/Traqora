import {
  InMemoryCacheService,
  createCacheService,
  getCacheService,
  __resetCacheServiceForTests,
} from '../../src/services/cacheService';

describe('InMemoryCacheService (issue #335)', () => {
  it('returns null on a miss and the stored value on a hit', async () => {
    const cache = new InMemoryCacheService('test');
    expect(await cache.get('missing')) .toBeNull();

    await cache.set('key1', { a: 1 }, 60);
    expect(await cache.get('key1')).toEqual({ a: 1 });
  });

  it('expires entries after their TTL', async () => {
    const cache = new InMemoryCacheService('test');
    await cache.set('key1', 'value', -1);
    expect(await cache.get('key1')).toBeNull();
  });

  it('deletes a single key via del', async () => {
    const cache = new InMemoryCacheService('test');
    await cache.set('key1', 'value', 60);
    await cache.del('key1');
    expect(await cache.get('key1')).toBeNull();
  });

  it('invalidates only keys matching a prefix', async () => {
    const cache = new InMemoryCacheService('test');
    await cache.set('flights:a', 1, 60);
    await cache.set('flights:b', 2, 60);
    await cache.set('bookings:a', 3, 60);

    await cache.invalidatePrefix('flights:');

    expect(await cache.get('flights:a')).toBeNull();
    expect(await cache.get('flights:b')).toBeNull();
    expect(await cache.get('bookings:a')).toBe(3);
  });

  describe('getOrSet', () => {
    it('computes and caches the value on a miss', async () => {
      const cache = new InMemoryCacheService('test');
      const fn = jest.fn().mockResolvedValue('computed');

      const result = await cache.getOrSet('key1', 60, fn);

      expect(result).toBe('computed');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns the cached value without recomputing on a hit', async () => {
      const cache = new InMemoryCacheService('test');
      const fn = jest.fn().mockResolvedValue('computed');

      await cache.getOrSet('key1', 60, fn);
      const second = await cache.getOrSet('key1', 60, fn);

      expect(second).toBe('computed');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});

describe('createCacheService factory (issue #335)', () => {
  it('produces an in-memory cache when no redisUrl or clusterNodes are given', async () => {
    const cache = createCacheService(undefined, [], 'test');
    await cache.set('key1', 'value', 60);
    expect(await cache.get('key1')).toBe('value');
  });
});

describe('getCacheService singleton (issue #335)', () => {
  afterEach(() => {
    __resetCacheServiceForTests();
  });

  it('returns the same instance on repeated calls', () => {
    const first = getCacheService();
    const second = getCacheService();
    expect(first).toBe(second);
  });

  it('returns a fresh instance after a test reset', () => {
    const first = getCacheService();
    __resetCacheServiceForTests();
    const second = getCacheService();
    expect(first).not.toBe(second);
  });
});
