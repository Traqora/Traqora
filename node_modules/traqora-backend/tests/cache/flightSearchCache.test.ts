import { InMemorySearchCache } from '../../src/cache/searchCache';
import {
  buildFlightSearchCacheKey,
  flightSearchCachePrefix,
  flightSearchScope,
  FLIGHT_SEARCH_CACHE_PREFIX,
  getOrSetFlightSearchCache,
  invalidateAllFlightSearchCache,
  invalidateFlightSearchCacheForFlight,
} from '../../src/services/cache';
import { FlightSearchCriteria } from '../../src/types/flight';

const criteria: FlightSearchCriteria = {
  from: 'SFO',
  to: 'NRT',
  date: '2026-03-01',
  passengers: 2,
  travelClass: 'economy',
  sortBy: 'price',
  pageSize: 20,
};

const flightOnDate = (date: string) => ({
  fromAirport: 'SFO',
  toAirport: 'NRT',
  departureTime: new Date(`${date}T18:00:00Z`),
});

describe('flight search cache keys (issue #534)', () => {
  it('scopes keys to a versioned prefix', () => {
    expect(FLIGHT_SEARCH_CACHE_PREFIX).toBe('flight-search:v2');
    expect(buildFlightSearchCacheKey(criteria).startsWith(`${FLIGHT_SEARCH_CACHE_PREFIX}:`)).toBe(true);
  });

  it('builds the same key for the same criteria', () => {
    expect(buildFlightSearchCacheKey(criteria)).toBe(buildFlightSearchCacheKey({ ...criteria }));
  });

  it('separates different criteria with different digests', () => {
    expect(buildFlightSearchCacheKey(criteria)).not.toBe(
      buildFlightSearchCacheKey({ ...criteria, passengers: 3 })
    );
  });

  it('derives a route/date prefix so a scope can be invalidated', () => {
    const prefix = flightSearchCachePrefix(criteria);
    expect(prefix).toBe(`${FLIGHT_SEARCH_CACHE_PREFIX}:SFO-NRT-2026-03-01:`);
    expect(buildFlightSearchCacheKey(criteria).startsWith(prefix)).toBe(true);
  });

  it('normalizes the scope so equivalent inputs share an invalidation prefix', () => {
    expect(flightSearchScope({ from: 'sfo', to: 'nrt', date: '2026-03-01T00:00:00.000Z' })).toBe(
      'SFO-NRT-2026-03-01'
    );
  });

  it('folds key-hostile characters out of the scope', () => {
    expect(flightSearchScope({ from: 'SFO', to: 'NRT:*', date: '2026-03-01' })).toBe('SFO-NRT---2026-03-01');
  });

  it('does not treat a longer route as a prefix of a shorter one', () => {
    const shortPrefix = flightSearchCachePrefix({ from: 'SFO', to: 'NRT', date: '2026-03-01' });
    const longerKey = buildFlightSearchCacheKey({ ...criteria, to: 'NRTX' });
    expect(longerKey.startsWith(shortPrefix)).toBe(false);
  });
});

describe('getOrSetFlightSearchCache (issue #534)', () => {
  it('caches the computed value and does not recompute on a hit', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const compute = jest.fn().mockResolvedValue({ data: ['a'] });

    const first = await getOrSetFlightSearchCache(cache, 'key-1', 60, compute);
    const second = await getOrSetFlightSearchCache(cache, 'key-1', 60, compute);

    expect(first).toEqual({ data: ['a'] });
    expect(second).toEqual({ data: ['a'] });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recomputes after the entry is invalidated', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const compute = jest.fn().mockResolvedValue('value');

    await getOrSetFlightSearchCache(cache, 'key-1', 60, compute);
    await cache.invalidate('key-1');
    await getOrSetFlightSearchCache(cache, 'key-1', 60, compute);

    expect(compute).toHaveBeenCalledTimes(2);
  });

  it('returns the computed value when the cache is unavailable', async () => {
    const cache: any = {
      get: jest.fn().mockRejectedValue(new Error('redis down')),
      set: jest.fn().mockRejectedValue(new Error('redis down')),
      invalidate: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const compute = jest.fn().mockResolvedValue('value');

    await expect(getOrSetFlightSearchCache(cache, 'key-1', 60, compute)).resolves.toBe('value');
    expect(compute).toHaveBeenCalledTimes(1);
  });
});

describe('flight search cache invalidation (issue #534)', () => {
  it('drops only the entries for the affected route and date', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const affected = buildFlightSearchCacheKey(criteria);
    const otherDate = buildFlightSearchCacheKey({ ...criteria, date: '2026-03-02' });

    await cache.set(affected, 'stale', 60);
    await cache.set(otherDate, 'fresh', 60);

    await invalidateFlightSearchCacheForFlight(flightOnDate('2026-03-01'), cache);

    await expect(cache.get(affected)).resolves.toBeNull();
    await expect(cache.get(otherDate)).resolves.toBe('fresh');
  });

  it('drops both scopes when a flight is moved to another date', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const before = buildFlightSearchCacheKey(criteria);
    const after = buildFlightSearchCacheKey({ ...criteria, date: '2026-03-05' });

    await cache.set(before, 'stale', 60);
    await cache.set(after, 'stale', 60);

    await invalidateFlightSearchCacheForFlight(flightOnDate('2026-03-01'), cache);
    await invalidateFlightSearchCacheForFlight(flightOnDate('2026-03-05'), cache);

    await expect(cache.get(before)).resolves.toBeNull();
    await expect(cache.get(after)).resolves.toBeNull();
  });

  it('reduces a timestamped departure to its date', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const key = buildFlightSearchCacheKey(criteria);
    await cache.set(key, 'stale', 60);

    // Matches `normalizeDateValue` in the repository, which also keys on the
    // UTC calendar date of the departure.
    await invalidateFlightSearchCacheForFlight(flightOnDate('2026-03-01'), cache);

    await expect(cache.get(key)).resolves.toBeNull();
  });

  it('falls back to a full invalidation when the route is unknown', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const key = buildFlightSearchCacheKey(criteria);
    await cache.set(key, 'fresh', 60);

    await invalidateFlightSearchCacheForFlight({}, cache);

    await expect(cache.get(key)).resolves.toBeNull();
  });

  it('clears every flight search entry on a rate change', async () => {
    const cache = new InMemorySearchCache('flight-search');
    const one = buildFlightSearchCacheKey(criteria);
    const two = buildFlightSearchCacheKey({ ...criteria, date: '2026-03-09' });
    await cache.set(one, 'a', 60);
    await cache.set(two, 'b', 60);

    await invalidateAllFlightSearchCache(cache);

    await expect(cache.get(one)).resolves.toBeNull();
    await expect(cache.get(two)).resolves.toBeNull();
  });

  it('does not delete unrelated cache namespaces', async () => {
    const cache = new InMemorySearchCache('flight-search');
    await cache.set('flight-registry:v1:abc', 'keep', 60);

    await invalidateAllFlightSearchCache(cache);

    await expect(cache.get('flight-registry:v1:abc')).resolves.toBe('keep');
  });
});
