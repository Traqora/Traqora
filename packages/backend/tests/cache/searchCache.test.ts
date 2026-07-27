import { InMemorySearchCache, withDistributedLock } from '../../src/cache/searchCache';

describe('InMemorySearchCache.invalidate (issue #383)', () => {
  it('removes only keys matching the given prefix', async () => {
    const cache = new InMemorySearchCache('test');
    await cache.set('flights:JFK-LHR:2026-08-01', { a: 1 }, 60);
    await cache.set('flights:JFK-CDG:2026-08-01', { a: 2 }, 60);
    await cache.set('bookings:abc', { a: 3 }, 60);

    await cache.invalidate('flights:');

    expect(await cache.get('flights:JFK-LHR:2026-08-01')).toBeNull();
    expect(await cache.get('flights:JFK-CDG:2026-08-01')).toBeNull();
    expect(await cache.get('bookings:abc')).toEqual({ a: 3 });
  });

  it('is a no-op when nothing matches the prefix', async () => {
    const cache = new InMemorySearchCache('test');
    await cache.set('bookings:abc', { a: 1 }, 60);

    await expect(cache.invalidate('flights:')).resolves.toBeUndefined();
    expect(await cache.get('bookings:abc')).toEqual({ a: 1 });
  });
});

describe('withDistributedLock (issue #383)', () => {
  it('runs the callback directly when no Redis client is available', async () => {
    const result = await withDistributedLock(null, 'lock:test', 5, async () => 'done');
    expect(result).toBe('done');
  });

  it('propagates the callback result when a lock is acquired', async () => {
    const fakeRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };

    const result = await withDistributedLock(fakeRedis as any, 'lock:resource-1', 10, async () => 42);

    expect(result).toBe(42);
    expect(fakeRedis.set).toHaveBeenCalledWith('lock:resource-1', expect.any(String), 'PX', 10000, 'NX');
    expect(fakeRedis.eval).toHaveBeenCalledTimes(1); // release attempted
  });

  it('throws when the lock is already held (SET NX fails)', async () => {
    const fakeRedis = {
      set: jest.fn().mockResolvedValue(null), // NX failed — someone else holds it
      eval: jest.fn(),
    };

    await expect(
      withDistributedLock(fakeRedis as any, 'lock:resource-1', 10, async () => 'unreachable'),
    ).rejects.toThrow('Could not acquire lock');

    expect(fakeRedis.eval).not.toHaveBeenCalled(); // never acquired, nothing to release
  });

  it('still releases the lock when the callback throws', async () => {
    const fakeRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockResolvedValue(1),
    };

    await expect(
      withDistributedLock(fakeRedis as any, 'lock:resource-1', 10, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(fakeRedis.eval).toHaveBeenCalledTimes(1);
  });

  it('does not throw if releasing the lock errors (best-effort release)', async () => {
    const fakeRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      eval: jest.fn().mockRejectedValue(new Error('network blip')),
    };

    const result = await withDistributedLock(fakeRedis as any, 'lock:resource-1', 10, async () => 'ok');
    expect(result).toBe('ok');
  });
});
