import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import Redis from 'ioredis';
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
} from 'rate-limiter-flexible';
import { logger } from './logger';

export interface IpRateLimitOptions {
  points: number;
  durationSeconds: number;
  keyPrefix?: string;
  redisUrl?: string;
}

export interface TierRateLimit {
  points: number;
  durationSeconds: number;
}

export interface TieredRateLimitOptions {
  redisUrl?: string;
  keyPrefix?: string;
  trustProxy?: boolean;
  useCloudflareHeaders?: boolean;
  public: TierRateLimit;
  user: TierRateLimit;
  premium: TierRateLimit;
  ddos: TierRateLimit;
  blockDurationSeconds: number;
  blockAfterViolations: number;
  captchaAfterViolations: number;
}

type RateLimiterLike = {
  consume: (key: string, points?: number) => Promise<RateLimiterRes>;
};

type InMemoryEntry = {
  value: number;
  expiresAt: number;
};

class InMemoryAbuseStore {
  private readonly whitelist = new Set<string>();
  private readonly blacklist = new Map<string, number>();
  private readonly blocked = new Map<string, number>();
  private readonly violations = new Map<string, InMemoryEntry>();

  private cleanupExpiringMaps(now = Date.now()) {
    for (const [key, expiresAt] of this.blacklist.entries()) {
      if (expiresAt <= now) {
        this.blacklist.delete(key);
      }
    }

    for (const [key, expiresAt] of this.blocked.entries()) {
      if (expiresAt <= now) {
        this.blocked.delete(key);
      }
    }

    for (const [key, value] of this.violations.entries()) {
      if (value.expiresAt <= now) {
        this.violations.delete(key);
      }
    }
  }

  isWhitelisted(ip: string): boolean {
    return this.whitelist.has(ip);
  }

  isBlacklisted(ip: string): boolean {
    this.cleanupExpiringMaps();
    return this.blacklist.has(ip);
  }

  addWhitelist(ip: string) {
    this.whitelist.add(ip);
  }

  removeWhitelist(ip: string) {
    this.whitelist.delete(ip);
  }

  addBlacklist(ip: string, ttlSeconds: number) {
    this.blacklist.set(ip, Date.now() + ttlSeconds * 1000);
  }

  removeBlacklist(ip: string) {
    this.blacklist.delete(ip);
  }

  isBlocked(ip: string): { blocked: boolean; msRemaining: number } {
    this.cleanupExpiringMaps();
    const expiresAt = this.blocked.get(ip);
    if (!expiresAt) {
      return { blocked: false, msRemaining: 0 };
    }
    return { blocked: true, msRemaining: Math.max(0, expiresAt - Date.now()) };
  }

  blockIp(ip: string, durationSeconds: number) {
    this.blocked.set(ip, Date.now() + durationSeconds * 1000);
  }

  incrementViolation(ip: string, ttlSeconds: number): number {
    this.cleanupExpiringMaps();
    const current = this.violations.get(ip);
    const nextValue = (current?.value || 0) + 1;
    this.violations.set(ip, {
      value: nextValue,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return nextValue;
  }

  getViolationCount(ip: string): number {
    this.cleanupExpiringMaps();
    return this.violations.get(ip)?.value || 0;
  }

  getLists() {
    this.cleanupExpiringMaps();
    const now = Date.now();
    return {
      whitelist: [...this.whitelist.values()],
      blacklist: [...this.blacklist.entries()].map(([ip, expiresAt]) => ({
        ip,
        expiresAt,
        ttlSeconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)),
      })),
      blocked: [...this.blocked.entries()].map(([ip, expiresAt]) => ({
        ip,
        expiresAt,
        ttlSeconds: Math.max(0, Math.ceil((expiresAt - now) / 1000)),
      })),
    };
  }
}

class RedisAbuseStore {
  private readonly inMemoryStore = new InMemoryAbuseStore();
  private readonly redisUrl: string;
  private redisClient: Redis | null = null;
  private redisDisabled = false;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
  }

  private async getClient(): Promise<Redis | null> {
    if (this.redisDisabled) {
      return null;
    }

    if (this.redisClient) {
      return this.redisClient;
    }

    try {
      const client = new Redis(this.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
      });
      await client.connect();
      this.redisClient = client;
      return client;
    } catch (_error) {
      this.redisDisabled = true;
      logger.warn('Rate limiter Redis unavailable, falling back to in-memory protection');
      return null;
    }
  }

  async isWhitelisted(ip: string): Promise<boolean> {
    const redis = await this.getClient();
    if (!redis) {
      return this.inMemoryStore.isWhitelisted(ip);
    }
    const result = await redis.sismember('rl:whitelist', ip);
    return result === 1;
  }

  async isBlacklisted(ip: string): Promise<boolean> {
    const redis = await this.getClient();
    if (!redis) {
      return this.inMemoryStore.isBlacklisted(ip);
    }
    const val = await redis.get(`rl:blacklist:${ip}`);
    return !!val;
  }

  async addWhitelist(ip: string): Promise<void> {
    const redis = await this.getClient();
    if (!redis) {
      this.inMemoryStore.addWhitelist(ip);
      return;
    }
    await redis.sadd('rl:whitelist', ip);
  }

  async removeWhitelist(ip: string): Promise<void> {
    const redis = await this.getClient();
    if (!redis) {
      this.inMemoryStore.removeWhitelist(ip);
      return;
    }
    await redis.srem('rl:whitelist', ip);
  }

  async addBlacklist(ip: string, ttlSeconds: number): Promise<void> {
    const redis = await this.getClient();
    if (!redis) {
      this.inMemoryStore.addBlacklist(ip, ttlSeconds);
      return;
    }
    await redis.set(`rl:blacklist:${ip}`, '1', 'EX', ttlSeconds);
  }

  async removeBlacklist(ip: string): Promise<void> {
    const redis = await this.getClient();
    if (!redis) {
      this.inMemoryStore.removeBlacklist(ip);
      return;
    }
    await redis.del(`rl:blacklist:${ip}`);
  }

  async isBlocked(ip: string): Promise<{ blocked: boolean; msRemaining: number }> {
    const redis = await this.getClient();
    if (!redis) {
      return this.inMemoryStore.isBlocked(ip);
    }

    const ttl = await redis.pttl(`rl:blocked:${ip}`);
    if (ttl > 0) {
      return { blocked: true, msRemaining: ttl };
    }
    return { blocked: false, msRemaining: 0 };
  }

  async blockIp(ip: string, durationSeconds: number): Promise<void> {
    const redis = await this.getClient();
    if (!redis) {
      this.inMemoryStore.blockIp(ip, durationSeconds);
      return;
    }
    await redis.set(`rl:blocked:${ip}`, '1', 'EX', durationSeconds);
  }

  async incrementViolation(ip: string, ttlSeconds: number): Promise<number> {
    const redis = await this.getClient();
    if (!redis) {
      return this.inMemoryStore.incrementViolation(ip, ttlSeconds);
    }

    const key = `rl:violations:${ip}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return count;
  }

  async getViolationCount(ip: string): Promise<number> {
    const redis = await this.getClient();
    if (!redis) {
      return this.inMemoryStore.getViolationCount(ip);
    }
    const count = await redis.get(`rl:violations:${ip}`);
    return Number.parseInt(count || '0', 10);
  }

  async getLists() {
    const redis = await this.getClient();
    if (!redis) {
      return this.inMemoryStore.getLists();
    }

    const whitelist = await redis.smembers('rl:whitelist');
    const blacklistKeys = await redis.keys('rl:blacklist:*');
    const blockedKeys = await redis.keys('rl:blocked:*');

    const mapKeysWithTtl = async (keys: string[], prefix: string) => {
      const values = await Promise.all(
        keys.map(async (key) => {
          const ttlMs = await redis.pttl(key);
          return {
            ip: key.slice(prefix.length),
            ttlSeconds: ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0,
            expiresAt: ttlMs > 0 ? Date.now() + ttlMs : Date.now(),
          };
        })
      );
      return values;
    };

    const blacklist = await mapKeysWithTtl(blacklistKeys, 'rl:blacklist:');
    const blocked = await mapKeysWithTtl(blockedKeys, 'rl:blocked:');

    return { whitelist, blacklist, blocked };
  }
}

const inMemoryStore = new InMemoryAbuseStore();
let sharedRedisStore: RedisAbuseStore | null = null;

const getAbuseStore = (redisUrl?: string) => {
  if (!redisUrl) {
    return inMemoryStore;
  }

  if (!sharedRedisStore) {
    sharedRedisStore = new RedisAbuseStore(redisUrl);
  }
  return sharedRedisStore;
};

const createLimiter = (
  options: IpRateLimitOptions,
  insuranceLimiter: RateLimiterMemory
): RateLimiterLike => {
  if (!options.redisUrl) {
    return new RateLimiterMemory({
      points: options.points,
      duration: options.durationSeconds,
      keyPrefix: options.keyPrefix,
    });
  }

  const redisClient = new Redis(options.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
  });

  return new RateLimiterRedis({
    storeClient: redisClient,
    points: options.points,
    duration: options.durationSeconds,
    keyPrefix: options.keyPrefix,
    insuranceLimiter,
  });
};

const getClientIp = (req: Request, useCloudflareHeaders: boolean): string => {
  if (useCloudflareHeaders) {
    const cfIp = req.header('cf-connecting-ip');
    if (cfIp) {
      return cfIp;
    }
  }

  const forwarded = req.header('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
};

const computeFingerprint = (req: Request, ip: string): string => {
  const rawFingerprint = [
    ip,
    req.method,
    req.baseUrl,
    req.path,
    req.header('user-agent') || 'unknown-agent',
    req.header('accept-language') || 'unknown-lang',
    req.header('x-user-id') || 'anonymous',
  ].join('|');

  return crypto.createHash('sha256').update(rawFingerprint).digest('hex').slice(0, 32);
};

const resolveTier = (req: Request): 'public' | 'user' | 'premium' => {
  const explicitTier = req.header('x-user-tier')?.toLowerCase();
  if (explicitTier === 'premium') {
    return 'premium';
  }
  if (explicitTier === 'user') {
    return 'user';
  }

  const userId = req.header('x-user-id') || (req as any).user?.id;
  const hasAuth = !!req.header('authorization') || !!userId;
  if (hasAuth) {
    return 'user';
  }

  return 'public';
};

const setRateLimitHeaders = (
  res: Response,
  limit: number,
  limiterRes: Pick<RateLimiterRes, 'remainingPoints' | 'msBeforeNext'>
) => {
  const resetEpochSeconds = Math.ceil((Date.now() + limiterRes.msBeforeNext) / 1000);
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limiterRes.remainingPoints)));
  res.setHeader('X-RateLimit-Reset', String(resetEpochSeconds));
};

const setThrottledHeaders = (res: Response, limit: number, retryAfterSeconds: number) => {
  const resetEpochSeconds = Math.ceil(Date.now() / 1000) + retryAfterSeconds;
  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', '0');
  res.setHeader('X-RateLimit-Reset', String(resetEpochSeconds));
  res.setHeader('Retry-After', String(retryAfterSeconds));
};

export const createIpRateLimiter = (options: IpRateLimitOptions) => {
  const insuranceLimiter = new RateLimiterMemory({
    points: options.points,
    duration: options.durationSeconds,
    keyPrefix: `${options.keyPrefix || 'traqora-rate-limit'}-insurance`,
  });
  const limiter = createLimiter(options, insuranceLimiter);

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req, false);
    try {
      const result = await limiter.consume(ip);
      setRateLimitHeaders(res, options.points, result);
      next();
    } catch (rateLimitError: any) {
      const retryAfter = Math.max(
        1,
        Math.ceil((rateLimitError?.msBeforeNext || options.durationSeconds * 1000) / 1000)
      );
      setThrottledHeaders(res, options.points, retryAfter);
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
        },
      });
    }
  };
};

export const createTieredRateLimiter = (options: TieredRateLimitOptions) => {
  const abuseStore = getAbuseStore(options.redisUrl);
  const prefix = options.keyPrefix || 'traqora-tiered-rate-limit';

  const publicLimiter = createLimiter(
    {
      points: options.public.points,
      durationSeconds: options.public.durationSeconds,
      keyPrefix: `${prefix}:public`,
      redisUrl: options.redisUrl,
    },
    new RateLimiterMemory({
      points: options.public.points,
      duration: options.public.durationSeconds,
      keyPrefix: `${prefix}:public:insurance`,
    })
  );

  const userLimiter = createLimiter(
    {
      points: options.user.points,
      durationSeconds: options.user.durationSeconds,
      keyPrefix: `${prefix}:user`,
      redisUrl: options.redisUrl,
    },
    new RateLimiterMemory({
      points: options.user.points,
      duration: options.user.durationSeconds,
      keyPrefix: `${prefix}:user:insurance`,
    })
  );

  const premiumLimiter = createLimiter(
    {
      points: options.premium.points,
      durationSeconds: options.premium.durationSeconds,
      keyPrefix: `${prefix}:premium`,
      redisUrl: options.redisUrl,
    },
    new RateLimiterMemory({
      points: options.premium.points,
      duration: options.premium.durationSeconds,
      keyPrefix: `${prefix}:premium:insurance`,
    })
  );

  const ddosLimiter = createLimiter(
    {
      points: options.ddos.points,
      durationSeconds: options.ddos.durationSeconds,
      keyPrefix: `${prefix}:ddos`,
      redisUrl: options.redisUrl,
    },
    new RateLimiterMemory({
      points: options.ddos.points,
      duration: options.ddos.durationSeconds,
      keyPrefix: `${prefix}:ddos:insurance`,
    })
  );

  const getTierLimiter = (tier: 'public' | 'user' | 'premium') => {
    if (tier === 'premium') {
      return { limiter: premiumLimiter, limit: options.premium.points };
    }
    if (tier === 'user') {
      return { limiter: userLimiter, limit: options.user.points };
    }
    return { limiter: publicLimiter, limit: options.public.points };
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = getClientIp(req, options.useCloudflareHeaders || false);
    const path = req.baseUrl + req.path;
    const fingerprint = computeFingerprint(req, ip);
    const tier = resolveTier(req);

    res.setHeader('X-Request-Fingerprint', fingerprint);
    res.setHeader('X-RateLimit-Tier', tier);

    if (await abuseStore.isWhitelisted(ip)) {
      return next();
    }

    if (await abuseStore.isBlacklisted(ip)) {
      return res.status(403).json({
        error: {
          code: 'IP_BLACKLISTED',
          message: 'Access denied for this IP address.',
        },
      });
    }

    const blockedStatus = await abuseStore.isBlocked(ip);
    if (blockedStatus.blocked) {
      const retryAfter = Math.max(1, Math.ceil(blockedStatus.msRemaining / 1000));
      setThrottledHeaders(res, options.public.points, retryAfter);
      res.setHeader('X-Captcha-Required', 'true');
      return res.status(429).json({
        error: {
          code: 'IP_BLOCKED',
          message: 'Request origin temporarily blocked due to abusive traffic.',
        },
        captchaRequired: true,
      });
    }

    try {
      await ddosLimiter.consume(`${ip}:${fingerprint}`);
    } catch (ddosError: any) {
      await abuseStore.blockIp(ip, options.blockDurationSeconds);
      logger.warn('Potential DDoS burst detected and IP blocked', {
        ip,
        path,
        fingerprint,
        msBeforeNext: ddosError?.msBeforeNext,
      });
      setThrottledHeaders(res, options.ddos.points, Math.ceil(options.blockDurationSeconds));
      res.setHeader('X-Captcha-Required', 'true');
      return res.status(429).json({
        error: {
          code: 'DDOS_PROTECTION_TRIGGERED',
          message: 'Traffic burst detected. Please retry later.',
        },
        captchaRequired: true,
      });
    }

    const { limiter, limit } = getTierLimiter(tier);
    const keyIdentity = tier === 'public' ? ip : req.header('x-user-id') || req.header('authorization') || ip;

    try {
      const result = await limiter.consume(`${keyIdentity}:${path}`);
      setRateLimitHeaders(res, limit, result);
      return next();
    } catch (tierError: any) {
      const violations = await abuseStore.incrementViolation(ip, 3600);
      if (violations >= options.blockAfterViolations) {
        await abuseStore.blockIp(ip, options.blockDurationSeconds);
      }

      const retryAfter = Math.max(1, Math.ceil((tierError?.msBeforeNext || 1000) / 1000));
      setThrottledHeaders(res, limit, retryAfter);
      if (violations >= options.captchaAfterViolations) {
        res.setHeader('X-Captcha-Required', 'true');
      }

      logger.warn('Rate limit exceeded', {
        ip,
        path,
        tier,
        fingerprint,
        violations,
        blocked: violations >= options.blockAfterViolations,
      });

      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
        },
        captchaRequired: violations >= options.captchaAfterViolations,
      });
    }
  };
};

export const abuseListManager = {
  addWhitelist: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).addWhitelist(ip),
  removeWhitelist: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).removeWhitelist(ip),
  addBlacklist: async (ip: string, ttlSeconds: number, redisUrl?: string) =>
    getAbuseStore(redisUrl).addBlacklist(ip, ttlSeconds),
  removeBlacklist: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).removeBlacklist(ip),
  getLists: async (redisUrl?: string) => getAbuseStore(redisUrl).getLists(),
  isWhitelisted: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).isWhitelisted(ip),
  isBlacklisted: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).isBlacklisted(ip),
  getViolationCount: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).getViolationCount(ip),
  isBlocked: async (ip: string, redisUrl?: string) => getAbuseStore(redisUrl).isBlocked(ip),
};
