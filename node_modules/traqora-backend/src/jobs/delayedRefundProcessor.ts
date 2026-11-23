import { RefundService } from '../services/refundService';
import { logger } from '../utils/logger';
import { initDataSource } from '../db/dataSource';

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
    if (this.isProcessing) {
      logger.info('Delayed refund processor already running, skipping this cycle');
      return;
    }

    this.isProcessing = true;

    try {
      await initDataSource();

      const readyRefunds = await this.refundService.getDelayedRefundsReadyForProcessing();

      if (readyRefunds.length === 0) {
        logger.debug('No delayed refunds ready for processing');
        return;
      }

      logger.info(`Processing ${readyRefunds.length} expired delayed refunds`);

      let successCount = 0;
      let failureCount = 0;

      for (const refund of readyRefunds) {
        try {
          await this.refundService.processDelayedRefund(refund.id);
          successCount++;
          logger.info(`Successfully processed delayed refund ${refund.id}`);
        } catch (error: any) {
          failureCount++;
          logger.error(`Failed to process delayed refund ${refund.id}`, {
            error: error.message,
            refundId: refund.id,
            bookingId: refund.booking.id,
          });
        }
      }

      logger.info(
        `Delayed refund processing complete: ${successCount} succeeded, ${failureCount} failed`
      );
    } catch (error: any) {
      logger.error('Error in delayed refund processor', { error: error.message });
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
