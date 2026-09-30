import { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { getCacheService } from './cacheService';
import { recordCacheOperation } from './metrics';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createSearchCache, SearchCache } from '../cache/searchCache';
import { parseRedisClusterNodes } from '../cache/redisClusterConfig';
import { FlightSearchCriteria } from '../types/flight';

type AsyncMiddleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

const wrapAsync = (fn: AsyncMiddleware) => (req: Request, res: Response, next: NextFunction): void => {
  fn(req, res, next).catch(next);
};

/**
 * API response caching (issue #222). Wraps the existing Redis-backed
 * `CacheService` (services/cacheService.ts) with an Express middleware that
 * caches whole JSON responses, keyed by route + query string, and a
 * `invalidateResponseCache` helper for write-path invalidation.
 */
export interface ResponseCacheOptions {
  /** Seconds the response stays cached. Defaults to config.apiResponseCacheTtlSeconds. */
  ttlSeconds?: number;
  /** Cache key prefix; also the invalidation prefix. Defaults to the route path. */
  keyPrefix?: string;
}

interface CachedResponse {
  statusCode: number;
  body: unknown;
}

const buildCacheKey = (prefix: string, req: Request): string => {
  return `api-response:${prefix}:${req.originalUrl}`;
};

/**
 * Caches successful (2xx) JSON GET responses. Non-GET requests and
 * non-2xx/non-JSON responses pass through uncached.
 */
export const cacheResponse = (options: ResponseCacheOptions = {}) => {
  const cache = getCacheService();
  const ttlSeconds = options.ttlSeconds ?? config.apiResponseCacheTtlSeconds;

  return wrapAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const keyPrefix = options.keyPrefix ?? req.baseUrl ?? req.path;
    const cacheKey = buildCacheKey(keyPrefix, req);

    try {
      const cached = await cache.get<CachedResponse>(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.status(cached.statusCode).json(cached.body);
        return;
      }
    } catch (error) {
      logger.warn('cacheResponse: cache read failed, falling through to handler', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cache
          .set<CachedResponse>(cacheKey, { statusCode: res.statusCode, body }, ttlSeconds)
          .catch((error) => {
            logger.warn('cacheResponse: cache write failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
      }
      return originalJson(body);
    };

    next();
  });
};

/** Invalidates every cached response under a route prefix (e.g. after a write). */
export const invalidateResponseCache = async (keyPrefix: string): Promise<void> => {
  const cache = getCacheService();
  await cache.invalidatePrefix(`api-response:${keyPrefix}:`);
};

// ─── Flight-search cache (issue #534) ────────────────────────────────────────

/**
 * Namespace for cached flight-search responses.
 *
 * The `:v2` segment is a key-schema version, not a semantic one: search keys
 * used to be an opaque base64 blob of the criteria, which made them impossible
 * to target by prefix. Bumping the version retires the old shape (those keys
 * simply age out of the TTL) and gives invalidation a stable, human-readable
 * prefix to work with.
 */
export const FLIGHT_SEARCH_CACHE_PREFIX = 'flight-search:v2';

/** Minimum subset of a flight search that a write path can invalidate. */
export interface FlightSearchInvalidationTarget {
  from: string;
  to: string;
  date: string;
}

/** Minimal cache surface the flight-search invalidation needs. */
export interface FlightSearchInvalidator {
  invalidate(keyPrefix: string): Promise<void>;
}

/**
 * Route/date of a flight, as used in search keys.
 *
 * IATA codes and ISO dates are already prefix-safe; anything else is folded to
 * `-` so a crafted value can never escape its key segment and match (or evict)
 * another route's entries.
 */
const sanitizeKeySegment = (value: string): string => {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-');
};

/**
 * `YYYY-MM-DD` for a `Date` or date-ish string, in UTC.
 *
 * A bare `YYYY-MM-DD` is returned untouched: parsing it would go through
 * `Date`, which resolves it as local midnight and can shift the day backwards
 * in negative-offset timezones. Anything else is reduced to its UTC date, which
 * is the same convention the flight repository uses when it compares
 * `departure_date`.
 */
const toDateKey = (value: Date | string): string => {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString().slice(0, 10);
};

/** Stable, prefix-friendly `FROM-TO-DATE` scope segment. */
export const flightSearchScope = (target: FlightSearchInvalidationTarget): string => {
  // The date is reduced to its calendar day first, then folded: a caller that
  // passes a full timestamp still lands on the same scope as a bare date, and
  // an unparseable value still cannot escape its key segment.
  return [
    sanitizeKeySegment(target.from),
    sanitizeKeySegment(target.to),
    sanitizeKeySegment(toDateKey(target.date)),
  ].join('-');
};

/**
 * Cache key for one search.
 *
 * Layout: `flight-search:v2:<FROM-TO-DATE>:<digest>`. The scope is a plain
 * prefix so a schedule/price change can evict exactly the affected searches;
 * the digest covers every remaining criterion (filters, sort, page, cursor) so
 * two different searches on the same route never share an entry.
 */
export const buildFlightSearchCacheKey = (criteria: FlightSearchCriteria): string => {
  const digest = createHash('sha256')
    .update(JSON.stringify(criteria))
    .digest('hex')
    .slice(0, 32);

  return `${FLIGHT_SEARCH_CACHE_PREFIX}:${flightSearchScope(criteria)}:${digest}`;
};

/** Key prefix covering every cached search for one route and departure date. */
export const flightSearchCachePrefix = (target: FlightSearchInvalidationTarget): string => {
  return `${FLIGHT_SEARCH_CACHE_PREFIX}:${flightSearchScope(target)}:`;
};

/**
 * Maps a flight row onto the search scope it invalidates.
 *
 * Accepts both the search-facing shape (`from`/`to`/`date`) and the persisted
 * entity shape (`fromAirport`/`toAirport`/`departureTime`) so call sites stay
 * one-liners. Returns `null` when the flight cannot be located on a route,
 * in which case the caller should fall back to a full invalidation.
 */
export const flightSearchTargetFromFlight = (flight: {
  from?: string;
  to?: string;
  date?: string;
  fromAirport?: string;
  toAirport?: string;
  departureTime?: Date | string;
}): FlightSearchInvalidationTarget | null => {
  const from = flight.from ?? flight.fromAirport;
  const to = flight.to ?? flight.toAirport;
  const departure = flight.date ?? flight.departureTime;

  if (!from || !to || !departure) {
    return null;
  }

  return { from, to, date: toDateKey(departure) };
};

let sharedFlightSearchCache: SearchCache | null = null;

/**
 * The single flight-search cache instance.
 *
 * Shared so that searches and the write paths that invalidate them talk to the
 * same Redis client (and the same in-memory fallback when Redis is down).
 */
export const getFlightSearchCache = (): SearchCache => {
  if (!sharedFlightSearchCache) {
    sharedFlightSearchCache = createSearchCache(
      config.redisUrl || undefined,
      'flight-search',
      parseRedisClusterNodes(config.redisClusterNodes),
    );
  }

  return sharedFlightSearchCache;
};

/** Test seam: drops the memoized cache instance. */
export const resetFlightSearchCache = (): void => {
  sharedFlightSearchCache = null;
};

/**
 * Read-through flight-search cache.
 *
 * A cache failure is never fatal: reads fall through to `load` and write
 * failures are logged, so search keeps working when Redis is unavailable.
 */
export const getOrSetFlightSearchCache = async <T>(
  cache: SearchCache,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> => {
  try {
    const cached = await cache.get<T>(key);
    if (cached) {
      return cached;
    }
  } catch (error) {
    logger.warn('flightSearchCache: cache read failed, recomputing', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const value = await load();

  if (ttlSeconds > 0) {
    try {
      await cache.set(key, value, ttlSeconds);
    } catch (error) {
      logger.warn('flightSearchCache: cache write failed', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return value;
};

/**
 * Evicts every cached search for one route and departure date.
 *
 * Idempotent: deleting keys that are already gone (or were never written) is a
 * no-op, and cache errors are swallowed so a write path is never blocked by
 * cache maintenance. Returns whether invalidation was actually attempted.
 */
export const invalidateFlightSearchCache = async (
  target: FlightSearchInvalidationTarget,
  cache: FlightSearchInvalidator = getFlightSearchCache(),
): Promise<boolean> => {
  const keyPrefix = flightSearchCachePrefix(target);

  try {
    await cache.invalidate(keyPrefix);
    return true;
  } catch (error) {
    logger.warn('flightSearchCache: invalidation failed', {
      keyPrefix,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

/**
 * Evicts cached searches for a flight row, falling back to a full invalidation
 * when the flight's route is unknown.
 */
export const invalidateFlightSearchCacheForFlight = async (
  flight: Parameters<typeof flightSearchTargetFromFlight>[0],
  cache: FlightSearchInvalidator = getFlightSearchCache(),
): Promise<boolean> => {
  const target = flightSearchTargetFromFlight(flight);
  return target ? invalidateFlightSearchCache(target, cache) : invalidateAllFlightSearchCache(cache);
};

/** Evicts every cached flight search. */
export const invalidateAllFlightSearchCache = async (
  cache: FlightSearchInvalidator = getFlightSearchCache(),
): Promise<boolean> => {
  try {
    await cache.invalidate(`${FLIGHT_SEARCH_CACHE_PREFIX}:`);
    return true;
  } catch (error) {
    logger.warn('flightSearchCache: full invalidation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

export { recordCacheOperation };
