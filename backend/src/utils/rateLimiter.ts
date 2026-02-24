import { RateLimiterMemory } from 'rate-limiter-flexible';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

const rateLimiter = new RateLimiterMemory({
  points: config.rateLimitMax,
  duration: Math.floor(config.rateLimitWindowMs / 1000),
});

export const rateLimiterMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await rateLimiter.consume(req.ip || 'unknown');
    next();
  } catch {
    res.status(429).json({
      error: {
        message: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
      },
    });
  }
};

export { rateLimiterMiddleware as rateLimiter };
