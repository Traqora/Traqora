import { BookingForPoints } from '../../types/loyalty';
import { LoyaltyStore } from './store';
import { PointsCalculator } from './pointsCalculator';
import { logger } from '../../utils/logger';

export interface RetroactiveResult {
  userId: string;
  bookingsProcessed: number;
  totalPointsAwarded: number;
  skippedBookings: string[];
}

export class RetroactiveCalculator {
  private store: LoyaltyStore;
  private pointsCalculator: PointsCalculator;

  constructor(store: LoyaltyStore, pointsCalculator: PointsCalculator) {
    this.store = store;
    this.pointsCalculator = pointsCalculator;
  }

  /**
   * Award points for historical bookings that are missing points records.
   *
   * Each booking is checked against existing transactions — if points
   * were already granted for a booking ID the booking is skipped to
   * prevent double-crediting.
   */
  processRetroactive(
    userId: string,
    bookings: BookingForPoints[],
  ): RetroactiveResult {
    const result: RetroactiveResult = {
      userId,
      bookingsProcessed: 0,
      totalPointsAwarded: 0,
      skippedBookings: [],
    };

    for (const booking of bookings) {
      if (booking.userId !== userId) {
        result.skippedBookings.push(booking.bookingId);
        continue;
      }

      // Guard against double-crediting
      const existing = this.store.getTransactionsByBooking(booking.bookingId);
      if (existing.length > 0) {
        result.skippedBookings.push(booking.bookingId);
        continue;
      }

      try {
        const calcResult = this.pointsCalculator.award(booking);
        result.bookingsProcessed++;
        result.totalPointsAwarded += calcResult.totalPoints;
      } catch (err) {
        logger.warn({
          msg: 'Failed to process retroactive booking',
          bookingId: booking.bookingId,
          error: err instanceof Error ? err.message : String(err),
        });
        result.skippedBookings.push(booking.bookingId);
      }
    }

    logger.info({
      msg: 'Retroactive calculation complete',
      userId,
      processed: result.bookingsProcessed,
      awarded: result.totalPointsAwarded,
      skipped: result.skippedBookings.length,
    });

    return result;
  }

  /**
   * Reconcile an account's stored balance against the sum of all its
   * transaction events. Returns the discrepancy (if any) so that the
   * caller can decide how to handle it.
   */
  reconcileBalance(
    userId: string,
  ): { storedBalance: number; calculatedBalance: number; difference: number } {
    const account = this.store.getAccount(userId);
    if (!account) {
      return { storedBalance: 0, calculatedBalance: 0, difference: 0 };
    }

    const transactions = this.store.getTransactionsByUser(userId);
    const calculatedBalance = transactions.reduce((sum, tx) => sum + tx.points, 0);
    const storedBalance = account.totalPoints;

    if (calculatedBalance !== storedBalance) {
      logger.warn({
        msg: 'Balance mismatch detected',
        userId,
        stored: storedBalance,
        calculated: calculatedBalance,
        difference: calculatedBalance - storedBalance,
      });
    }

    return {
      storedBalance,
      calculatedBalance,
      difference: calculatedBalance - storedBalance,
    };
  }
}
