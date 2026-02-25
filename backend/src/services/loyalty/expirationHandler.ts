import { PointsTransactionType } from '../../types/loyalty';
import { LoyaltyStore } from './store';
import { TierManager } from './tierManager';
import { logger } from '../../utils/logger';

export interface ExpirationResult {
  userId: string;
  expiredPoints: number;
  transactionsProcessed: number;
}

export class ExpirationHandler {
  private store: LoyaltyStore;
  private tierManager: TierManager;

  constructor(store: LoyaltyStore, tierManager: TierManager) {
    this.store = store;
    this.tierManager = tierManager;
  }

  /**
   * Expire points for a single user whose expiration date has passed.
   *
   * For each expired EARNED transaction a negative EXPIRED event is
   * appended, the original is marked so it won't be processed twice,
   * and the account balance is reduced accordingly.
   */
  processUserExpirations(userId: string, asOf?: Date): ExpirationResult {
    const cutoff = asOf ?? new Date();
    const account = this.store.getAccount(userId);

    if (!account) {
      return { userId, expiredPoints: 0, transactionsProcessed: 0 };
    }

    const expiring = this.store.getExpiringTransactions(userId, cutoff);
    if (expiring.length === 0) {
      return { userId, expiredPoints: 0, transactionsProcessed: 0 };
    }

    let totalExpired = 0;

    for (const tx of expiring) {
      this.store.markTransactionExpired(tx.id);

      this.store.appendTransaction({
        userId,
        points: -tx.points,
        type: PointsTransactionType.EXPIRED,
        bookingId: tx.bookingId,
        description: `Points expired (earned ${tx.createdAt.toISOString()})`,
      });

      totalExpired += tx.points;
    }

    account.totalPoints = Math.max(0, account.totalPoints - totalExpired);
    account.availablePoints = Math.max(0, account.availablePoints - totalExpired);
    this.store.updateAccount(account);

    // Tier may drop after losing points
    this.tierManager.evaluateTier(userId);

    logger.info({
      msg: 'Points expired',
      userId,
      expiredPoints: totalExpired,
      transactions: expiring.length,
    });

    return {
      userId,
      expiredPoints: totalExpired,
      transactionsProcessed: expiring.length,
    };
  }

  /**
   * Process expirations across every known account.
   * Designed to be invoked by a scheduled job / cron.
   */
  processAllExpirations(asOf?: Date): ExpirationResult[] {
    return this.store
      .getAllAccounts()
      .map(a => this.processUserExpirations(a.userId, asOf))
      .filter(r => r.expiredPoints > 0);
  }

  /** Preview how many points will expire before a given date. */
  getUpcomingExpirations(
    userId: string,
    beforeDate: Date,
  ): { points: number; count: number } {
    const expiring = this.store.getExpiringTransactions(userId, beforeDate);
    const points = expiring.reduce((sum, tx) => sum + tx.points, 0);
    return { points, count: expiring.length };
  }
}
