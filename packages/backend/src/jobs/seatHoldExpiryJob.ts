import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { seatAvailabilityService } from '../services/seatAvailabilityService';
import { logger } from '../utils/logger';
import { createJobLogger } from './jobLogger';

const CRON_EXPRESSION = process.env.SEAT_HOLD_EXPIRY_CRON || '* * * * *';

export class SeatHoldExpiryJob {
  private task: ScheduledTask | null = null;

  constructor(
    private readonly cleanup: () => Promise<number> = () =>
      seatAvailabilityService.cleanupExpiredLocks(),
  ) {}

  /** Run one expiry sweep immediately (also invoked by the cron tick). */
  async runNow(): Promise<{ seatsReleased: number }> {
    const log = createJobLogger('seat-hold-expiry');
    log.start();

    try {
      const seatsReleased = await this.cleanup();
      log.complete({ seatsReleased });
      return { seatsReleased };
    } catch (error) {
      log.fail({
        step: 'cleanup_expired_holds',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  start(): void {
    if (this.task) return;

    this.task = cron.schedule(CRON_EXPRESSION, () => {
      this.runNow().catch((error) => {
        logger.error('seatHoldExpiryJob: unhandled error during scheduled run', {
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

let sharedJob: SeatHoldExpiryJob | null = null;

export const initSeatHoldExpiryCron = (): SeatHoldExpiryJob => {
  if (!sharedJob) {
    sharedJob = new SeatHoldExpiryJob();
    sharedJob.start();
  }
  return sharedJob;
};
