/**
 * Analytics API rate-limiting middleware — issue #251.
 *
 * Per-endpoint, per-user limits backed by Redis (falls back to in-memory when
 * Redis is unavailable). Enforces:
 *   - 100 req/min default (Free tier), configurable via TIER_QUOTAS
 *   - 1 000 req/hr quota window
 *   - Burst allowance per tier
 *   - Standard rate-limit response headers
 *   - 429 with Retry-After on exhaustion
 */

import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { TIER_QUOTAS, resolveTierName, TierName } from '../config/tiers';
import { logger } from '../utils/logger';

// ── Limiter registry (one pair per tier × window) ───────────────────────────

type LimiterPair = {
  minute: RateLimiterMemory | RateLimiterRedis;
  hour: RateLimiterMemory | RateLimiterRedis;
};

const redisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL;

function buildLimiter(
  keyPrefix: string,
  points: number,
  durationSeconds: number,
): RateLimiterMemory | RateLimiterRedis {
  const insurance = new RateLimiterMemory({ points, duration: durationSeconds, keyPrefix: `${keyPrefix}:ins` });
  if (!redisUrl) {
    return new RateLimiterMemory({ points, duration: durationSeconds, keyPrefix });
  }
  return new RateLimiterRedis({
    storeClient: new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableReadyCheck: true }),
    points,
    duration: durationSeconds,
    keyPrefix,
    insuranceLimiter: insurance,
  });
}

const limiterCache = new Map<TierName, LimiterPair>();

function getLimiters(tier: TierName): LimiterPair {
  const cached = limiterCache.get(tier);
  if (cached) return cached;

  const quota = TIER_QUOTAS[tier];
  const pair: LimiterPair = {
    minute: buildLimiter(`analytics-rl:${tier}:min`, quota.perMinute + quota.burstAllowance, 60),
    hour: buildLimiter(`analytics-rl:${tier}:hr`, quota.perHour, 3600),
  };
  limiterCache.set(tier, pair);
  return pair;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clientKey(req: Request): string {
  return req.header('x-user-id') || req.header('authorization') || req.ip || 'anon';
}

function setHeaders(res: Response, limit: number, result: RateLimiterRes) {
  const resetEpoch = Math.ceil((Date.now() + result.msBeforeNext) / 1000);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.remainingPoints)));
  res.setHeader('X-RateLimit-Reset', String(resetEpoch));
}

function setExhaustedHeaders(res: Response, limit: number, retryAfterSec: number) {
  const resetEpoch = Math.ceil(Date.now() / 1000) + retryAfterSec;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', '0');
  res.setHeader('X-RateLimit-Reset', String(resetEpoch));
  res.setHeader('Retry-After', String(retryAfterSec));
}

// ── Middleware factory ────────────────────────────────────────────────────────

/**
 * Returns an Express middleware that applies per-minute and per-hour rate
 * limits to analytics endpoints based on the caller's tier.
 */
export function analyticsRateLimit() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const tier = resolveTierName(req.header('x-user-tier'));
    const quota = TIER_QUOTAS[tier];
    const key = clientKey(req);
    const endpoint = `${req.method}:${req.baseUrl}${req.path}`;
    const { minute, hour } = getLimiters(tier);

    res.setHeader('X-RateLimit-Tier', tier);

    // Check per-minute window first
    try {
      const minResult = await minute.consume(`${key}:${endpoint}`);
      setHeaders(res, quota.perMinute, minResult);
    } catch (err: any) {
      const retryAfter = Math.max(1, Math.ceil((err?.msBeforeNext ?? 60_000) / 1000));
      setExhaustedHeaders(res, quota.perMinute, retryAfter);
      logger.warn('Analytics rate limit exceeded (per-minute)', { tier, key, endpoint });
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
          window: '1m',
          retryAfterSeconds: retryAfter,
        },
      });
    }

    // Check per-hour quota
    try {
      await hour.consume(`${key}:${endpoint}`);
    } catch (err: any) {
      const retryAfter = Math.max(1, Math.ceil((err?.msBeforeNext ?? 3_600_000) / 1000));
      setExhaustedHeaders(res, quota.perHour, retryAfter);
      logger.warn('Analytics rate limit exceeded (per-hour quota)', { tier, key, endpoint });
      return res.status(429).json({
        error: {
          code: 'HOURLY_QUOTA_EXCEEDED',
          message: 'Hourly request quota exhausted.',
          window: '1h',
          retryAfterSeconds: retryAfter,
        },
      });
    }

    return next();
  };
}
