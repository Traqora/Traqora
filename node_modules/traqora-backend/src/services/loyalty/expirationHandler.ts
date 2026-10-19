import { PointsTransactionType } from '../../types/loyalty';
import { LoyaltyStore } from './store';
import { TierManager } from './tierManager';
import { logger } from '../../utils/logger';
import { NotificationService } from '../NotificationService';

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_THRESHOLDS_DAYS = [30, 7];

export interface ExpirationResult {
  userId: string;
  expiredPoints: number;
  transactionsProcessed: number;
}

export interface ExpirationReminderResult {
  userId: string;
  points: number;
  daysUntilExpiry: number;
  expiresAt: Date;
}

export class ExpirationHandler {
  private store: LoyaltyStore;
  private tierManager: TierManager;
  private notificationService: Pick<NotificationService, 'queueNotification'>;

  constructor(
    store: LoyaltyStore,
    tierManager: TierManager,
    notificationService: Pick<NotificationService, 'queueNotification'> = NotificationService.getInstance(),
  ) {
    this.store = store;
    this.tierManager = tierManager;
    this.notificationService = notificationService;
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

  /** Send one in-app reminder when an earned transaction enters a reminder window. */
  async processAllExpirationReminders(
    asOf: Date = new Date(),
  ): Promise<ExpirationReminderResult[]> {
    const reminders: ExpirationReminderResult[] = [];

    for (const account of this.store.getAllAccounts()) {
      for (const transaction of this.store.getTransactionsByUser(account.userId)) {
        if (
          transaction.type !== PointsTransactionType.EARNED ||
          transaction.points <= 0 ||
          !transaction.expiresAt ||
          transaction.expiresAt <= asOf
        ) {
          continue;
        }

        const daysUntilExpiry = Math.ceil(
          (transaction.expiresAt.getTime() - asOf.getTime()) / DAY_MS,
        );
        if (
          !REMINDER_THRESHOLDS_DAYS.includes(daysUntilExpiry) ||
          this.store.hasExpirationReminderBeenSent(transaction.id, daysUntilExpiry)
        ) {
          continue;
        }

        await this.notificationService.queueNotification(
          account.userId,
          {
            id: `loyalty-expiry-${transaction.id}-${daysUntilExpiry}`,
            userId: account.userId,
            category: 'loyalty',
            title: 'Loyalty points expiring soon',
            body: `${transaction.points} points expire in ${daysUntilExpiry} days (${transaction.expiresAt.toISOString().slice(0, 10)}).`,
            data: {
              points: transaction.points,
              expiresAt: transaction.expiresAt.toISOString(),
              daysUntilExpiry,
            },
            actionUrl: '/loyalty',
            timestamp: asOf,
          },
          ['inapp'],
        );

        this.store.markExpirationReminderSent(transaction.id, daysUntilExpiry);
        reminders.push({
          userId: account.userId,
          points: transaction.points,
          daysUntilExpiry,
          expiresAt: transaction.expiresAt,
        });
      }
    }

    return reminders;
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
