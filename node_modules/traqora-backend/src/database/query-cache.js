/**
 * Query Result Caching (#247)
 *
 * Redis-based query result cache with configurable TTL.
 * Reduces database load for frequently-accessed analytics queries.
 */

const redis = require('redis');

const DEFAULT_TTL = 5 * 60; // 5 minutes in seconds
const MAX_CACHE_KEY_LENGTH = 512;

class QueryCache {
  constructor(redisUrl = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.client = null;
    this.redisUrl = redisUrl;
    this.connected = false;
    this.hits = 0;
    this.misses = 0;
    this.entries = 0;
  }

  /**
   * Connect to Redis.
   */
  async connect() {
    try {
      this.client = redis.createClient({ url: this.redisUrl });
      await this.client.connect();
      this.connected = true;
      console.log('[QueryCache] Connected to Redis');
    } catch (err) {
      console.error('[QueryCache] Redis connection failed, using in-memory fallback:', err.message);
      this._useFallback = true;
      this._fallbackStore = new Map();
    }
  }

  /**
   * Disconnect from Redis.
   */
  async disconnect() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }

  /**
   * Generate a deterministic cache key from query and params.
   */
  _buildCacheKey(query, params) {
    const normalized = query.replace(/\s+/g, ' ').trim().toLowerCase();
    const paramStr = params ? JSON.stringify(params) : '';
    const key = `qc:${Buffer.from(normalized + paramStr).toString('base64url').slice(0, MAX_CACHE_KEY_LENGTH)}`;
    return key;
  }

  /**
   * Get cached query result.
   */
  async get(query, params) {
    const key = this._buildCacheKey(query, params);

    if (this._useFallback) {
      const entry = this._fallbackStore.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        this.hits++;
        return entry.data;
      }
      this._fallbackStore.delete(key);
      this.misses++;
      return null;
    }

    try {
      const data = await this.client.get(key);
      if (data !== null) {
        this.hits++;
        return JSON.parse(data);
      }
      this.misses++;
      return null;
    } catch (err) {
      console.error('[QueryCache] Get error:', err.message);
      this.misses++;
      return null;
    }
  }

  /**
   * Set cached query result with TTL.
   */
  async set(query, params, data, ttl = DEFAULT_TTL) {
    const key = this._buildCacheKey(query, params);

    if (this._useFallback) {
      // Enforce max 1000 entries in fallback
      if (this._fallbackStore.size >= 1000) {
        const oldestKey = this._fallbackStore.keys().next().value;
        this._fallbackStore.delete(oldestKey);
      }
      this._fallbackStore.set(key, {
        data,
        expiresAt: Date.now() + (ttl * 1000),
      });
      this.entries = this._fallbackStore.size;
      return;
    }

    try {
      await this.client.setEx(key, ttl, JSON.stringify(data));
      this.entries = await this.client.dbSize();
    } catch (err) {
      console.error('[QueryCache] Set error:', err.message);
    }
  }

  /**
   * Invalidate cache entries matching a pattern.
   */
  async invalidatePattern(pattern) {
    const searchKey = `qc:${pattern}`;

    if (this._useFallback) {
      for (const key of this._fallbackStore.keys()) {
        if (key.includes(pattern)) {
          this._fallbackStore.delete(key);
        }
      }
      this.entries = this._fallbackStore.size;
      return;
    }

    try {
      const keys = await this.client.keys(`qc:*${searchKey}*`);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (err) {
      console.error('[QueryCache] Invalidate error:', err.message);
    }
  }

  /**
   * Clear entire cache.
   */
  async clear() {
    if (this._useFallback) {
      this._fallbackStore.clear();
      this.entries = 0;
      return;
    }

    try {
      const keys = await this.client.keys('qc:*');
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      this.entries = 0;
    } catch (err) {
      console.error('[QueryCache] Clear error:', err.message);
    }
  }

  /**
   * Get cache statistics.
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%',
      entries: this.entries,
      connected: this.connected,
      usingFallback: !!this._useFallback,
    };
  }

  /**
   * Execute a query with caching: cache-first, then fall back to DB.
   * @param {string} query - SQL query
   * @param {Array} params - Query parameters
   * @param {Function} dbQueryFn - Function that executes the DB query
   * @param {number} ttl - Cache TTL in seconds
   */
  async cachedQuery(query, params, dbQueryFn, ttl = DEFAULT_TTL) {
    const cached = await this.get(query, params);
    if (cached !== null) {
      return cached;
    }

    const result = await dbQueryFn();
    await this.set(query, params, result, ttl);
    return result;
  }
}

module.exports = { QueryCache, DEFAULT_TTL };