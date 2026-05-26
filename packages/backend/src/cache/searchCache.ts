import Redis from 'ioredis';

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

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

export class RedisSearchCache implements SearchCache {
  private readonly memoryFallback = new InMemorySearchCache();
  private readonly redisUrl: string;
  private redisClient: Redis | null = null;
  private redisDisabled = false;

  constructor(redisUrl: string) {
    this.redisUrl = redisUrl;
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
    const redis = await this.getRedisClient();

    if (!redis) {
      return this.memoryFallback.get<T>(key);
    }

    try {
      const value = await redis.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (_error) {
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const redis = await this.getRedisClient();
    const serializedValue = JSON.stringify(value);

    if (!redis) {
      await this.memoryFallback.set(key, value, ttlSeconds);
      return;
    }

    try {
      await redis.set(key, serializedValue, 'EX', ttlSeconds);
    } catch (_error) {
      await this.memoryFallback.set(key, value, ttlSeconds);
    }
  }
}

export const createSearchCache = (redisUrl?: string): SearchCache => {
  if (!redisUrl) {
    return new InMemorySearchCache();
  }

  return new RedisSearchCache(redisUrl);
};