// src/middleware/rate-limit.ts
import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import ms from 'ms';

/**
 * Simple Redis‑backed rate limiter.
 * Reads configuration from environment variables:
 *   RATE_LIMIT_MAX    – max requests per window (default 100)
 *   RATE_LIMIT_WINDOW – window duration (e.g. "1m", "60s", default "1m")
 * If Redis is unavailable, falls back to an in‑memory map (suitable for dev).
 */
const redisUrl = process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || undefined;
const redisClient = redisUrl ? new Redis(redisUrl) : null;

const maxRequests = parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10);
const windowMs = ms(process.env.RATE_LIMIT_WINDOW ?? '1m');

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = req.ip; // could be expanded to user ID if authenticated
    const key = `rl:${identifier}`;
    let current: number | null = null;
    if (redisClient) {
      const results = await redisClient.multi()
        .incr(key)
        .pttl(key)
        .exec();
      current = Number(results[0][1]);
      const ttl = Number(results[1][1]);
      if (ttl === -1) {
        await redisClient.pexpire(key, windowMs);
      }
    } else {
      // fallback in‑memory store (simple object)
      if (!(global as any)._rateLimitStore) {
        (global as any)._rateLimitStore = new Map<string, { count: number; reset: number }>();
      }
      const store = (global as any)._rateLimitStore as Map<string, { count: number; reset: number }>;
      const now = Date.now();
      const entry = store.get(key);
      if (!entry || entry.reset <= now) {
        store.set(key, { count: 1, reset: now + windowMs });
        current = 1;
      } else {
        entry.count += 1;
        current = entry.count;
      }
    }

    if (current !== null && current > maxRequests) {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({ error: 'Too Many Requests', retryAfter });
      return;
    }
    next();
  } catch (err) {
    // on error, fail open – allow request
    console.error('Rate limiter error:', err);
    next();
  }
}
