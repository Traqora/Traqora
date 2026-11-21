import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createJobLogger } from './jobLogger';

const DEAD_LETTER_KEY = 'traqora:jobs:dead-letter';
/** Cap the persisted dead-letter list so a stuck upstream failure can't grow it unbounded. */
const MAX_DEAD_LETTER_ENTRIES = 1000;

export interface DeadLetterEntry {
  /** Original job id (queue-assigned id, or the caller's own id). */
  id: string;
  /** Stable queue/job name this entry came from, e.g. "loyalty-queue", "notification-worker". */
  queue: string;
  /** Job type/name within that queue, when the queue distinguishes job types. */
  type?: string;
  /** Original job payload, preserved so the job can be inspected or requeued. */
  data: unknown;
  /** Number of attempts made before the job was given up on. */
  attempts: number;
  /** Human-readable message from the final failure. */
  error: string;
  /** ISO timestamp of when the job was quarantined. */
  failedAt: string;
}

/**
 * Dead-letter store for background jobs that have exhausted their retries.
 *
 * Rather than letting a permanently-failed job vanish into a log line,
 * every consumer that gives up on a job should hand it to `deadLetterQueue.add(...)`
 * so it stays quarantined, logged, and inspectable (`list`/`get`) instead of being
 * retried forever or silently dropped.
 *
 * Backed by Redis when configured (`config.redisUrl`), matching the fallback pattern
 * used by `LoyaltyQueue`: an in-memory list is used when Redis is unavailable, which
 * keeps local development and unit tests frictionless.
 */
export class DeadLetterQueue {
  private redis: Redis | null = null;
  private memoryStore: DeadLetterEntry[] = [];

  constructor() {
    this.initRedis();
  }

  private initRedis(): void {
    if (!config.redisUrl) {
      logger.warn('Redis not configured — dead-letter queue will use in-memory storage');
      return;
    }

    try {
      this.redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 200, 5000),
      });

      this.redis.on('error', (err: Error) => {
        logger.error('dead-letter-queue: redis connection error', {
          job: 'dead-letter-queue',
          step: 'redis_connect',
          error: err.message,
        });
      });
    } catch (err) {
      logger.warn('dead-letter-queue: redis init failed — falling back to in-memory storage', {
        job: 'dead-letter-queue',
        step: 'redis_connect',
        error: err instanceof Error ? err.message : String(err),
      });
      this.redis = null;
    }
  }

  /** Quarantine a permanently-failed job. Logged and persisted for later inspection/requeue. */
  async add(entry: Omit<DeadLetterEntry, 'failedAt'>): Promise<DeadLetterEntry> {
    const record: DeadLetterEntry = {
      ...entry,
      failedAt: new Date().toISOString(),
    };

    const log = createJobLogger('dead-letter-queue', record.id);
    log.fail({
      step: 'quarantine',
      queue: record.queue,
      type: record.type,
      attempts: record.attempts,
      error: record.error,
    });

    if (this.redis) {
      const multi = this.redis.multi();
      multi.lpush(DEAD_LETTER_KEY, JSON.stringify(record));
      multi.ltrim(DEAD_LETTER_KEY, 0, MAX_DEAD_LETTER_ENTRIES - 1);
      await multi.exec();
    } else {
      this.memoryStore.unshift(record);
      if (this.memoryStore.length > MAX_DEAD_LETTER_ENTRIES) {
        this.memoryStore.length = MAX_DEAD_LETTER_ENTRIES;
      }
    }

    return record;
  }

  /** List quarantined jobs, most recently failed first. */
  async list(limit = 100): Promise<DeadLetterEntry[]> {
    if (this.redis) {
      const raw = await this.redis.lrange(DEAD_LETTER_KEY, 0, Math.max(0, limit - 1));
      return raw.map((item) => JSON.parse(item) as DeadLetterEntry);
    }

    return this.memoryStore.slice(0, limit);
  }

  /** Fetch a single quarantined entry by job id, or null if it isn't (or is no longer) dead-lettered. */
  async get(id: string): Promise<DeadLetterEntry | null> {
    const entries = await this.list(MAX_DEAD_LETTER_ENTRIES);
    return entries.find((entry) => entry.id === id) ?? null;
  }

  /** Remove a quarantined entry, e.g. after it has been manually requeued or resolved. */
  async remove(id: string): Promise<boolean> {
    if (this.redis) {
      const raw = await this.redis.lrange(DEAD_LETTER_KEY, 0, -1);
      const match = raw.find((item) => (JSON.parse(item) as DeadLetterEntry).id === id);
      if (!match) return false;
      const removed = await this.redis.lrem(DEAD_LETTER_KEY, 1, match);
      return removed > 0;
    }

    const index = this.memoryStore.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    this.memoryStore.splice(index, 1);
    return true;
  }

  /** Number of currently quarantined jobs. */
  async size(): Promise<number> {
    if (this.redis) {
      return this.redis.llen(DEAD_LETTER_KEY);
    }
    return this.memoryStore.length;
  }

  /** Disconnect from Redis, if connected. Primarily for graceful shutdown/tests. */
  async shutdown(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }
}

export const deadLetterQueue = new DeadLetterQueue();
