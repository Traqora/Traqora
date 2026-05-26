import Redis from 'ioredis';
import { recordCacheOperation } from '../services/metrics';

export interface SearchCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
}

interface InMemoryEntry {
  value: string;
  expiresAt: number;
}

export class InMemorySearchCache implements SearchCache {
  private readonly store = new Map<string, InMemoryEntry>();
  private readonly cacheName: string;

  constructor(cacheName = 'search-memory') {
    this.cacheName = cacheName;
  }

  async get<T>(key: string): Promise<T | null> {
    const start = process.hrtime.bigint();
    const entry = this.store.get(key);

    if (!entry) {
      recordCacheOperation(this.cacheName, 'get', 'miss', getDurationSeconds(start));
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      recordCacheOperation(this.cacheName, 'get', 'miss', getDurationSeconds(start));
      return null;
    }

    const parsed = JSON.parse(entry.value) as T;
    recordCacheOperation(this.cacheName, 'get', 'hit', getDurationSeconds(start));
    return parsed;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const start = process.hrtime.bigint();
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    recordCacheOperation(this.cacheName, 'set', 'set', getDurationSeconds(start));
  }
}

export class RedisSearchCache implements SearchCache {
  private readonly memoryFallback: InMemorySearchCache;
  private readonly redisUrl: string;
  private readonly cacheName: string;
  private redisClient: Redis | null = null;
  private redisDisabled = false;

  constructor(redisUrl: string, cacheName = 'search-redis') {
    this.redisUrl = redisUrl;
    this.cacheName = cacheName;
    this.memoryFallback = new InMemorySearchCache(`${cacheName}-fallback`);
  }

  private async getRedisClient(): Promise<Redis | null> {
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
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const start = process.hrtime.bigint();
    const redis = await this.getRedisClient();

    if (!redis) {
      const value = await this.memoryFallback.get<T>(key);
      recordCacheOperation(this.cacheName, 'get', 'fallback', getDurationSeconds(start));
      return value;
    }

    try {
      const value = await redis.get(key);
      if (!value) {
        recordCacheOperation(this.cacheName, 'get', 'miss', getDurationSeconds(start));
        return null;
      }

      const parsed = JSON.parse(value) as T;
      recordCacheOperation(this.cacheName, 'get', 'hit', getDurationSeconds(start));
      return parsed;
    } catch (_error) {
      const value = await this.memoryFallback.get<T>(key);
      recordCacheOperation(this.cacheName, 'get', 'error', getDurationSeconds(start));
      return value;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const start = process.hrtime.bigint();
    const redis = await this.getRedisClient();
    const serializedValue = JSON.stringify(value);

    if (!redis) {
      await this.memoryFallback.set(key, value, ttlSeconds);
      recordCacheOperation(this.cacheName, 'set', 'fallback', getDurationSeconds(start));
      return;
    }

    try {
      await redis.set(key, serializedValue, 'EX', ttlSeconds);
      recordCacheOperation(this.cacheName, 'set', 'set', getDurationSeconds(start));
    } catch (_error) {
      await this.memoryFallback.set(key, value, ttlSeconds);
      recordCacheOperation(this.cacheName, 'set', 'error', getDurationSeconds(start));
    }
  }
}

const getDurationSeconds = (start: bigint): number => {
  return Number(process.hrtime.bigint() - start) / 1_000_000_000;
};

export const createSearchCache = (redisUrl?: string, cacheName = 'search'): SearchCache => {
  if (!redisUrl) {
    return new InMemorySearchCache(`${cacheName}-memory`);
  }

  return new RedisSearchCache(redisUrl, `${cacheName}-redis`);
};
