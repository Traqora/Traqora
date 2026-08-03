import Redis, { Cluster } from 'ioredis';
import { recordCacheOperation } from './metrics';
import { parseRedisClusterNodes, RedisClusterNode } from '../cache/redisClusterConfig';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * General-purpose cache service (issue #335), distinct from
 * `cache/searchCache.ts`'s flight-search-specific cache. Any route/service
 * that needs read-through caching (not just flight search) can depend on
 * this instead of hand-rolling its own Redis client. Supports Redis Cluster
 * mode via REDIS_CLUSTER_NODES, with the same in-memory-fallback tolerance
 * established by searchCache.ts.
 */
export interface CacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  invalidatePrefix(keyPrefix: string): Promise<void>;
  /** Read-through helper: returns the cached value, or computes+caches it via fn on a miss. */
  getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
}

const getDurationSeconds = (start: bigint): number => {
  return Number(process.hrtime.bigint() - start) / 1_000_000_000;
};

export class InMemoryCacheService implements CacheService {
  private readonly store = new Map<string, MemoryEntry>();

  constructor(private readonly cacheName: string) {}

  async get<T>(key: string): Promise<T | null> {
    const start = process.hrtime.bigint();
    const entry = this.store.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) this.store.delete(key);
      recordCacheOperation(this.cacheName, 'get', 'miss', getDurationSeconds(start));
      return null;
    }
    recordCacheOperation(this.cacheName, 'get', 'hit', getDurationSeconds(start));
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const start = process.hrtime.bigint();
    this.store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
    recordCacheOperation(this.cacheName, 'set', 'set', getDurationSeconds(start));
  }

  async del(key: string): Promise<void> {
    const start = process.hrtime.bigint();
    this.store.delete(key);
    recordCacheOperation(this.cacheName, 'del', 'set', getDurationSeconds(start));
  }

  async invalidatePrefix(keyPrefix: string): Promise<void> {
    const start = process.hrtime.bigint();
    for (const key of this.store.keys()) {
      if (key.startsWith(keyPrefix)) this.store.delete(key);
    }
    recordCacheOperation(this.cacheName, 'invalidate', 'set', getDurationSeconds(start));
  }

  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    return getOrSetImpl(this, key, ttlSeconds, fn);
  }
}

class RedisCacheService implements CacheService {
  private readonly memoryFallback: InMemoryCacheService;
  private client: Redis | Cluster | null = null;
  private disabled = false;

  constructor(
    private readonly redisUrl: string,
    private readonly clusterNodes: RedisClusterNode[],
    private readonly cacheName: string,
  ) {
    this.memoryFallback = new InMemoryCacheService(`${cacheName}-fallback`);
  }

  private async getClient(): Promise<Redis | Cluster | null> {
    if (this.disabled) return null;
    if (this.client) return this.client;

    try {
      const client: Redis | Cluster = this.clusterNodes.length > 0
        ? new Redis.Cluster(this.clusterNodes, {
          lazyConnect: true,
          enableReadyCheck: true,
          redisOptions: { maxRetriesPerRequest: 1 },
        })
        : new Redis(this.redisUrl, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          enableReadyCheck: true,
        });
      await client.connect();
      this.client = client;
      return client;
    } catch (error) {
      this.disabled = true;
      logger.warn('cacheService: Redis unavailable, falling back to in-memory cache', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const start = process.hrtime.bigint();
    const client = await this.getClient();
    if (!client) return this.memoryFallback.get<T>(key);

    try {
      const value = await client.get(key);
      if (!value) {
        recordCacheOperation(this.cacheName, 'get', 'miss', getDurationSeconds(start));
        return null;
      }
      recordCacheOperation(this.cacheName, 'get', 'hit', getDurationSeconds(start));
      return JSON.parse(value) as T;
    } catch (_error) {
      recordCacheOperation(this.cacheName, 'get', 'error', getDurationSeconds(start));
      return this.memoryFallback.get<T>(key);
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const start = process.hrtime.bigint();
    const client = await this.getClient();
    if (!client) return this.memoryFallback.set(key, value, ttlSeconds);

    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      recordCacheOperation(this.cacheName, 'set', 'set', getDurationSeconds(start));
    } catch (_error) {
      recordCacheOperation(this.cacheName, 'set', 'error', getDurationSeconds(start));
      await this.memoryFallback.set(key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    const start = process.hrtime.bigint();
    const client = await this.getClient();
    if (!client) return this.memoryFallback.del(key);

    try {
      await client.del(key);
      recordCacheOperation(this.cacheName, 'del', 'set', getDurationSeconds(start));
    } catch (_error) {
      recordCacheOperation(this.cacheName, 'del', 'error', getDurationSeconds(start));
      await this.memoryFallback.del(key);
    }
  }

  /** SCAN + DEL rather than KEYS — non-blocking and cluster-safe (mirrors searchCache.ts). */
  async invalidatePrefix(keyPrefix: string): Promise<void> {
    const start = process.hrtime.bigint();
    const client = await this.getClient();
    if (!client) return this.memoryFallback.invalidatePrefix(keyPrefix);

    try {
      let cursor = '0';
      const matched: string[] = [];
      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${keyPrefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        matched.push(...keys);
      } while (cursor !== '0');

      if (matched.length > 0) {
        await client.del(...matched);
      }
      recordCacheOperation(this.cacheName, 'invalidate', 'set', getDurationSeconds(start));
    } catch (_error) {
      recordCacheOperation(this.cacheName, 'invalidate', 'error', getDurationSeconds(start));
      await this.memoryFallback.invalidatePrefix(keyPrefix);
    }
  }

  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    return getOrSetImpl(this, key, ttlSeconds, fn);
  }
}

const getOrSetImpl = async <T>(
  cache: CacheService,
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> => {
  const cached = await cache.get<T>(key);
  if (cached !== null) {
    return cached;
  }

  const computed = await fn();
  await cache.set(key, computed, ttlSeconds);
  return computed;
};

export const createCacheService = (
  redisUrl?: string,
  clusterNodes: RedisClusterNode[] = [],
  cacheName = 'app',
): CacheService => {
  if (!redisUrl && clusterNodes.length === 0) {
    return new InMemoryCacheService(`${cacheName}-memory`);
  }

  return new RedisCacheService(redisUrl || '', clusterNodes, `${cacheName}-redis`);
};

let sharedCacheService: CacheService | null = null;

/** Process-wide singleton, configured from env (REDIS_URL / REDIS_CLUSTER_NODES). */
export const getCacheService = (): CacheService => {
  if (!sharedCacheService) {
    sharedCacheService = createCacheService(
      config.redisUrl || undefined,
      parseRedisClusterNodes(config.redisClusterNodes),
      'app',
    );
  }
  return sharedCacheService;
};

/** Test-only reset so each test file gets a fresh singleton. */
export const __resetCacheServiceForTests = (): void => {
  sharedCacheService = null;
};
