import { NextFunction, Request, RequestHandler, Response } from 'express';
import Redis from 'ioredis';
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';
import { config } from '../config';

export interface IpRateLimitOptions {
  points: number;
  durationSeconds: number;
  keyPrefix?: string;
  redisUrl?: string;
}

interface RateLimiterRejection {
  msBeforeNext?: number;
}

const isRateLimiterRejection = (value: unknown): value is RateLimiterRejection => {
  return typeof value === 'object' && value !== null && 'msBeforeNext' in value;
};

const getClientIp = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const sendRateLimitError = (res: Response, rejection: RateLimiterRejection) => {
  const retryAfterSeconds = Math.max(1, Math.ceil((rejection.msBeforeNext || 1000) / 1000));

  res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
      retry_after_seconds: retryAfterSeconds,
    },
  });
};

export const createIpRateLimiter = (
  options?: Partial<IpRateLimitOptions>
): RequestHandler => {
  const resolvedOptions: IpRateLimitOptions = {
    points: options?.points ?? config.rateLimitMax,
    durationSeconds: options?.durationSeconds ?? config.rateLimitWindowSec,
    keyPrefix: options?.keyPrefix ?? 'traqora-ip-rate-limit',
    redisUrl: options?.redisUrl ?? (config.redisUrl || undefined),
  };

  const fallbackLimiter = new RateLimiterMemory({
    points: resolvedOptions.points,
    duration: resolvedOptions.durationSeconds,
    keyPrefix: `${resolvedOptions.keyPrefix}-memory`,
  });

  let primaryLimiter: RateLimiterMemory | RateLimiterRedis = fallbackLimiter;

  if (resolvedOptions.redisUrl) {
    const redisClient = new Redis(resolvedOptions.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });

    primaryLimiter = new RateLimiterRedis({
      storeClient: redisClient,
      points: resolvedOptions.points,
      duration: resolvedOptions.durationSeconds,
      keyPrefix: resolvedOptions.keyPrefix,
    });
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = getClientIp(req);

    try {
      await primaryLimiter.consume(key);
      next();
      return;
    } catch (error) {
      if (isRateLimiterRejection(error)) {
        sendRateLimitError(res, error);
        return;
      }

      try {
        await fallbackLimiter.consume(key);
        next();
        return;
      } catch (fallbackError) {
        if (isRateLimiterRejection(fallbackError)) {
          sendRateLimitError(res, fallbackError);
          return;
        }

        next();
      }
    }
  };
};