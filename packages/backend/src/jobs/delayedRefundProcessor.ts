import { RefundService } from '../services/refundService';
import { logger } from '../utils/logger';
import { initDataSource } from '../db/dataSource';
import { createJobLogger } from './jobLogger';

/**
 * Background job to process delayed refunds after timelock expiration
 * Should be run periodically (e.g., every 15 minutes)
 */
export class DelayedRefundProcessor {
  private static instance: DelayedRefundProcessor;
  private refundService: RefundService;
  private isProcessing: boolean = false;

  private constructor() {
    this.refundService = RefundService.getInstance();
  }

  public static getInstance(): DelayedRefundProcessor {
    if (!DelayedRefundProcessor.instance) {
      DelayedRefundProcessor.instance = new DelayedRefundProcessor();
    }
    return DelayedRefundProcessor.instance;
  }

  /**
   * Process all delayed refunds that are ready
   */
  public async processExpiredDelayedRefunds(): Promise<void> {
    const log = createJobLogger('delayed-refund-processor');

    if (this.isProcessing) {
      log.step('cycle_skipped', { reason: 'already_running' });
      return;
    }

    this.isProcessing = true;
    log.start();

    try {
      await initDataSource();
      log.step('init_data_source');

      const readyRefunds = await this.refundService.getDelayedRefundsReadyForProcessing();

      if (readyRefunds.length === 0) {
        log.complete({ ready: 0, succeeded: 0, failed: 0 });
        return;
      }

      log.step('load_ready_refunds', { ready: readyRefunds.length });

      let successCount = 0;
      let failureCount = 0;

      for (const refund of readyRefunds) {
        try {
          await this.refundService.processDelayedRefund(refund.id);
          successCount++;
          log.step('process_refund', { refundId: refund.id, outcome: 'success' });
        } catch (error: any) {
          failureCount++;
          log.step('process_refund', {
            outcome: 'failure',
            refundId: refund.id,
            bookingId: refund.booking.id,
            error: error.message,
          });
        }
      }

      log.complete({ ready: readyRefunds.length, succeeded: successCount, failed: failureCount });
    } catch (error: any) {
      log.fail({
        step: 'load_ready_refunds',
        error: error.message,
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start periodic processing of delayed refunds
   * @param intervalMinutes - How often to check for expired refunds (default: 15 minutes)
   */
  public startPeriodicProcessing(intervalMinutes: number = 15): NodeJS.Timeout {
    logger.info(
      `Starting delayed refund processor with ${intervalMinutes} minute interval`
    );

    // Run immediately on start
    this.processExpiredDelayedRefunds();

    // Then run periodically
    return setInterval(() => {
      this.processExpiredDelayedRefunds();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Get statistics about delayed refunds
   */
  public async getDelayedRefundStats(): Promise<{
    totalPending: number;
    readyForProcessing: number;
    averageDelayHours: number;
  }> {
    await initDataSource();

    const pending = await this.refundService.getPendingDelayedRefunds();
    const ready = await this.refundService.getDelayedRefundsReadyForProcessing();

    // Calculate average delay time
    let totalDelayHours = 0;
    for (const refund of pending) {
      if (refund.delayedUntil) {
        const delayHours =
          (refund.delayedUntil.getTime() - refund.createdAt.getTime()) / (1000 * 60 * 60);
        totalDelayHours += delayHours;
      }
    }

    const averageDelayHours = pending.length > 0 ? totalDelayHours / pending.length : 0;

    return {
      totalPending: pending.length,
      readyForProcessing: ready.length,
      averageDelayHours: Math.round(averageDelayHours * 100) / 100,
    };
  }
}

// Export singleton instance
export const delayedRefundProcessor = DelayedRefundProcessor.getInstance();
