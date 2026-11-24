import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { AppDataSource } from '../db/dataSource';
import { PendingBookingAgeService } from '../services/pendingBookingAgeService';
import { logger } from '../utils/logger';

const CRON_EXPRESSION = process.env.PENDING_BOOKING_AGE_CRON || '*/1 * * * *';

/** Periodically refreshes the gauge that drives stuck-booking alerts (#1174). */
export class PendingBookingAgeJob {
    private task: ScheduledTask | null = null;

    constructor(private readonly service: PendingBookingAgeService = new PendingBookingAgeService()) {}

    async runNow(): Promise<void> {
        if (!AppDataSource.isInitialized) {
            logger.warn('Skipping pending booking age refresh; database is not initialized');
            return;
        }
        const rows = await this.service.refresh();
        logger.debug('Pending booking age gauge refreshed', { statuses: rows.length });
    }

    start(): void {
        if (this.task) return;
        this.task = cron.schedule(CRON_EXPRESSION, () => {
            this.runNow().catch((error: unknown) => {
                logger.error('pendingBookingAgeJob: scheduled run failed', {
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

let sharedJob: PendingBookingAgeJob | null = null;

export const initPendingBookingAgeCron = (): PendingBookingAgeJob => {
    if (!sharedJob) {
        sharedJob = new PendingBookingAgeJob();
        sharedJob.start();
    }
    return sharedJob;
};
