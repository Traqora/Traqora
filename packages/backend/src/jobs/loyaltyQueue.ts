import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { logger } from '../utils/logger';
import { createJobLogger } from './jobLogger';

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

interface QueuedJob {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

const QUEUE_KEY = 'traqora:loyalty:jobs';
const MAX_RETRIES = 3;
const POLL_INTERVAL_MS = 1000;
const BACKOFF_MS = 2000;

/**
 * Lightweight Redis-backed job queue for asynchronous loyalty processing.
 *
 * Falls back to synchronous (immediate) execution when Redis is not
 * configured, keeping the development experience frictionless.
 */
export class LoyaltyQueue {
  private redis: Redis | null = null;
  private handlers = new Map<string, JobHandler>();
  private processing = false;

  constructor() {
    this.initRedis();
  }

  private initRedis(): void {
    if (!config.redisUrl) {
      logger.warn('Redis not configured — loyalty jobs will process synchronously');
      return;
    }

    try {
      this.redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => Math.min(times * 200, 5000),
      });

      this.redis.on('error', (err: Error) => {
        logger.error('loyalty-queue: redis connection error', {
          job: 'loyalty-queue',
          step: 'redis_connect',
          error: err.message,
        });
      });

      this.redis.on('connect', () => {
        logger.info('loyalty-queue: redis connected', {
          job: 'loyalty-queue',
          step: 'redis_connect',
        });
      });
    } catch (err) {
      logger.warn('loyalty-queue: redis init failed — falling back to sync processing', {
        job: 'loyalty-queue',
        step: 'redis_connect',
        error: err instanceof Error ? err.message : String(err),
      });
      this.redis = null;
    }
  }

  /** Register a handler for a given job type. */
  registerHandler(jobType: string, handler: JobHandler): void {
    this.handlers.set(jobType, handler);
  }

  /** Enqueue a job. Returns the generated job ID. */
  async enqueue(jobType: string, data: Record<string, unknown>): Promise<string> {
    const job: QueuedJob = {
      id: uuidv4(),
      type: jobType,
      data,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };

    if (this.redis) {
      await this.redis.rpush(QUEUE_KEY, JSON.stringify(job));
      logger.debug('loyalty-queue: job enqueued', {
        job: 'loyalty-queue',
        jobId: job.id,
        step: 'enqueue',
        type: jobType,
      });
    } else {
      await this.processJob(job);
    }

    return job.id;
  }

  /** Start the background polling loop (call once at startup). */
  async startProcessing(): Promise<void> {
    if (!this.redis || this.processing) return;

    this.processing = true;
    logger.info('Loyalty job queue processing started');

    while (this.processing) {
      try {
        const raw = await this.redis.lpop(QUEUE_KEY);
        if (!raw) {
          await this.sleep(POLL_INTERVAL_MS);
          continue;
        }

        const job: QueuedJob = JSON.parse(raw);
        await this.processJob(job);
      } catch (err) {
        logger.error({
          msg: 'Job processing error',
          error: err instanceof Error ? err.message : String(err),
        });
        await this.sleep(BACKOFF_MS);
      }
    }
  }

  /** Stop the polling loop gracefully. */
  stopProcessing(): void {
    this.processing = false;
  }

  /** Disconnect from Redis and stop processing. */
  async shutdown(): Promise<void> {
    this.stopProcessing();
    if (this.redis) {
      await this.redis.quit();
    }
  }

  private async processJob(job: QueuedJob): Promise<void> {
    const log = createJobLogger('loyalty-queue', job.id);
    const handler = this.handlers.get(job.type);
    if (!handler) {
      log.fail({
        step: 'dispatch',
        type: job.type,
        error: 'No handler registered for job type',
      });
      return;
    }

    log.start({ type: job.type });
    try {
      await handler(job.data);
      log.complete({ type: job.type });
    } catch (err) {
      job.attempts++;

      if (job.attempts < MAX_RETRIES && this.redis) {
        await this.redis.rpush(QUEUE_KEY, JSON.stringify(job));
        log.step('retry', {
          outcome: 'failure',
          attempt: job.attempts,
          error: err instanceof Error ? err.message : String(err),
        });
      } else {
        log.fail({
          step: 'execute',
          attempts: job.attempts,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
