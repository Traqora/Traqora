import { Request, Response, NextFunction } from 'express';
import { getCacheService } from './cacheService';
import { recordCacheOperation } from './metrics';
import { config } from '../config';
import { logger } from '../utils/logger';

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

export { recordCacheOperation };
