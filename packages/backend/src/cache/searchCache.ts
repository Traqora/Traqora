import Redis, { Cluster } from 'ioredis';
import { recordCacheOperation } from '../services/metrics';
import { RedisClusterNode } from './redisClusterConfig';

export interface SearchCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Deletes every key matching a prefix. Used for invalidation (issue #383). */
  invalidate(keyPrefix: string): Promise<void>;
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

  async invalidate(keyPrefix: string): Promise<void> {
    const start = process.hrtime.bigint();
    for (const key of this.store.keys()) {
      if (key.startsWith(keyPrefix)) this.store.delete(key);
    }
    recordCacheOperation(this.cacheName, 'invalidate', 'set', getDurationSeconds(start));
  }
}

export class RedisSearchCache implements SearchCache {
  private readonly memoryFallback: InMemorySearchCache;
  private readonly redisUrl: string;
  private readonly clusterNodes: RedisClusterNode[];
  private readonly cacheName: string;
  private redisClient: Redis | Cluster | null = null;
  private redisDisabled = false;

  /**
   * When clusterNodes is non-empty, connects via ioredis Cluster mode
   * instead of the single-node redisUrl (issue #335). Existing single-node
   * behavior is unchanged when clusterNodes is omitted/empty.
   */
  constructor(redisUrl: string, cacheName = 'search-redis', clusterNodes: RedisClusterNode[] = []) {
    this.redisUrl = redisUrl;
    this.clusterNodes = clusterNodes;
    this.cacheName = cacheName;
    this.memoryFallback = new InMemorySearchCache(`${cacheName}-fallback`);
  }

  private async getRedisClient(): Promise<Redis | Cluster | null> {
    if (this.redisDisabled) {
      return null;
    }

    if (this.redisClient) {
      return this.redisClient;
    }

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

  /**
   * Deletes every key matching a prefix via SCAN + DEL (not KEYS — SCAN is
   * non-blocking and safe on a cluster, where a single KEYS call only sees
   * one shard's keyspace anyway).
   */
  async invalidate(keyPrefix: string): Promise<void> {
    const start = process.hrtime.bigint();
    const redis = await this.getRedisClient();

    if (!redis) {
      await this.memoryFallback.invalidate(keyPrefix);
      recordCacheOperation(this.cacheName, 'invalidate', 'fallback', getDurationSeconds(start));
      return;
    }

    try {
      let cursor = '0';
      const matched: string[] = [];
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${keyPrefix}*`, 'COUNT', 100);
        cursor = nextCursor;
        matched.push(...keys);
      } while (cursor !== '0');

      if (matched.length > 0) {
        await redis.del(...matched);
      }
      recordCacheOperation(this.cacheName, 'invalidate', 'set', getDurationSeconds(start));
    } catch (_error) {
      await this.memoryFallback.invalidate(keyPrefix);
      recordCacheOperation(this.cacheName, 'invalidate', 'error', getDurationSeconds(start));
    }
  }

  /** Exposes the underlying client so callers can share it with withDistributedLock. */
  async getClient(): Promise<Redis | Cluster | null> {
    return this.getRedisClient();
  }
}

/**
 * Distributed lock (issue #383) using the standard Redis `SET NX PX`
 * pattern with a random token, so only the holder can release it (a
 * stale/duplicate release from a different caller is a no-op). Falls back
 * to running the callback without locking when Redis is unavailable —
 * consistent with this module's existing single-node-outage tolerance.
 */
export async function withDistributedLock<T>(
  redis: Redis | Cluster | null,
  lockKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!redis) {
    return fn();
  }

  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const acquired = await redis.set(lockKey, token, 'PX', ttlSeconds * 1000, 'NX');

  if (!acquired) {
    throw new Error(`Could not acquire lock: ${lockKey}`);
  }

  try {
    return await fn();
  } finally {
    // Only release if we still hold it (token still matches) — a Lua
    // script keeps the check-and-delete atomic.
    const releaseScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await redis.eval(releaseScript, 1, lockKey, token).catch(() => undefined);
  }
}

const getDurationSeconds = (start: bigint): number => {
  return Number(process.hrtime.bigint() - start) / 1_000_000_000;
};

export const createSearchCache = (
  redisUrl?: string,
  cacheName = 'search',
  clusterNodes: RedisClusterNode[] = [],
): SearchCache => {
  if (!redisUrl && clusterNodes.length === 0) {
    return new InMemorySearchCache(`${cacheName}-memory`);
  }

  return new RedisSearchCache(redisUrl || '', `${cacheName}-redis`, clusterNodes);
};
