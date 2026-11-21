/**
 * Token-bucket rate limiting middleware for Traqora API endpoints.
 *
 * Provides per-tier limits (anonymous < authenticated < premium) using the
 * existing RateLimiterMemory/RateLimiterRedis infrastructure from rateLimiter.ts,
 * plus token-bucket semantics for search vs. booking endpoints.
 *
 * Every response includes the standard X-RateLimit-* headers.
 * 429 responses always include a Retry-After header.
 */

import { NextFunction, Request, Response } from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { logger } from '../utils/logger';

export interface EndpointRateLimitConfig {
  anonymous:     { points: number; durationSeconds: number };
  authenticated: { points: number; durationSeconds: number };
  premium:       { points: number; durationSeconds: number };
  keyPrefix:     string;
}

const SEARCH_LIMITS: EndpointRateLimitConfig = {
  anonymous:     { points: 30,  durationSeconds: 60 },
  authenticated: { points: 120, durationSeconds: 60 },
  premium:       { points: 300, durationSeconds: 60 },
  keyPrefix:     'rl:search',
};

const BOOKING_LIMITS: EndpointRateLimitConfig = {
  anonymous:     { points: 5,  durationSeconds: 60 },
  authenticated: { points: 20, durationSeconds: 60 },
  premium:       { points: 50, durationSeconds: 60 },
  keyPrefix:     'rl:booking',
};

function resolveTier(req: Request): 'anonymous' | 'authenticated' | 'premium' {
  const user = (req as any).user;
  if (!user) return 'anonymous';
  if (user.tier === 'premium' || user.role === 'premium') return 'premium';
  return 'authenticated';
}

function resolveKey(req: Request, prefix: string): string {
  const user = (req as any).user;
  const identifier = user?.id ?? req.ip ?? 'unknown';
  return `${prefix}:${identifier}`;
}

const limiterCache = new Map<string, RateLimiterMemory>();

function getLimiter(config: EndpointRateLimitConfig, tier: 'anonymous' | 'authenticated' | 'premium'): RateLimiterMemory {
  const { points, durationSeconds } = config[tier];
  const cacheKey = `${config.keyPrefix}:${tier}:${points}:${durationSeconds}`;
  if (!limiterCache.has(cacheKey)) {
    limiterCache.set(cacheKey, new RateLimiterMemory({ points, duration: durationSeconds }));
  }
  return limiterCache.get(cacheKey)!;
}

function setRateLimitHeaders(res: Response, limiterRes: RateLimiterRes, total: number, _durationMs: number): void {
  res.setHeader('X-RateLimit-Limit', total);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limiterRes.remainingPoints));
  res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + Math.ceil(limiterRes.msBeforeNext / 1000));
}

function createRateLimitMiddleware(config: EndpointRateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tier    = resolveTier(req);
    const key     = resolveKey(req, config.keyPrefix);
    const limiter = getLimiter(config, tier);
    const { points, durationSeconds } = config[tier];

    try {
      const result = await limiter.consume(key);
      setRateLimitHeaders(res, result, points, durationSeconds * 1000);
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) {
        const retryAfter = Math.ceil(err.msBeforeNext / 1000);
        res.setHeader('X-RateLimit-Limit', points);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + retryAfter);
        res.setHeader('Retry-After', retryAfter);
        logger.warn('Rate limit exceeded', { ip: req.ip, tier, key, retryAfterSec: retryAfter });
        res.status(429).json({
          error:       'Too many requests',
          retryAfter,
          tier,
        });
        return;
      }
      logger.error('Rate limiter internal error', { err });
      next(err);
    }
  };
}

export const searchRateLimit  = createRateLimitMiddleware(SEARCH_LIMITS);
export const bookingRateLimit = createRateLimitMiddleware(BOOKING_LIMITS);
export { SEARCH_LIMITS, BOOKING_LIMITS };

/**
 * Wraps `middleware` so it never runs for any path in `excludedPaths`
 * (matched against `req.path`, i.e. relative to the router's own mount
 * point — see Express's `router.use` semantics). Used to apply a rate
 * limiter router-wide while carving out a webhook endpoint that's called
 * by external infrastructure (Stripe, a payment provider, ...) rather than
 * a tiered end user, which would otherwise be misclassified into the
 * tightest ("anonymous") tier and risk dropped deliveries under load.
 *
 * Returns (and awaits) `middleware`'s promise rather than firing it
 * synchronously, so the caller can compose this with `asyncHandler` — the
 * project's existing pattern (`utils/errorHandler.ts`) for routing a
 * rejected promise to `next(err)` instead of letting it become an
 * unhandled rejection.
 */
export function excludingPaths(
  middleware: (req: Request, res: Response, next: NextFunction) => void | Promise<void>,
  excludedPaths: readonly string[],
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (excludedPaths.includes(req.path)) {
      next();
      return;
    }
    await middleware(req, res, next);
  };
}
