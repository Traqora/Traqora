import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { AppDataSource } from '../db/dataSource';
import {
  ConfirmationRetryBatchSummary,
  ConfirmationRetryService,
  confirmationRetryService,
} from '../services/confirmationRetry';
import { logger } from '../utils/logger';
import { createJobLogger } from './jobLogger';

const CRON_EXPRESSION = process.env.CONFIRMATION_RETRY_CRON || '*/1 * * * *';

/**
 * Periodic safety net for on-chain confirmation (#1131). It picks up bookings
 * whose in-process poll was lost (restart) or that are still pending after
 * backoff, retries within the bounded policy, and surfaces a terminal `failed`
 * state once the budget is spent.
 */
export class ConfirmationRetryJob {
  private task: ScheduledTask | null = null;
  private isRunning = false;

  constructor(
    private readonly service: ConfirmationRetryService = confirmationRetryService,
  ) {}

  async runNow(): Promise<ConfirmationRetryBatchSummary> {
    if (this.isRunning) {
      logger.warn('Confirmation retry worker already running; skipping tick');
      return {
        scanned: 0,
        attempted: 0,
        confirmed: 0,
        scheduled: 0,
        failed: 0,
        skipped: 0,
      };
    }

    if (!AppDataSource.isInitialized) {
      logger.warn('Skipping confirmation retry sweep; database is not initialized');
      return {
        scanned: 0,
        attempted: 0,
        confirmed: 0,
        scheduled: 0,
        failed: 0,
        skipped: 0,
      };
    }

    const log = createJobLogger('confirmation-retry');
    this.isRunning = true;
    log.start();

    try {
      const summary = await this.service.runDueBatch();
      log.complete({ ...summary });
      return summary;
    } catch (error) {
      log.fail({
        step: 'run_confirmation_retry_batch',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  start(): void {
    if (this.task) return;

    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((error) => {
        logger.error('confirmationRetryJob: unhandled error during scheduled run', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
  }
}

let sharedJob: ConfirmationRetryJob | null = null;

export const initConfirmationRetryCron = (): ConfirmationRetryJob => {
  if (!sharedJob) {
    sharedJob = new ConfirmationRetryJob();
    sharedJob.start();
  }
  return sharedJob;
};
