import { v4 as uuidv4 } from 'uuid';
import {
  LoyaltyAccount,
  LoyaltyTier,
  PointsTransaction,
  PointsTransactionType,
  Campaign,
  PointsHistoryQuery,
  PaginatedResult,
} from '../../types/loyalty';

/**
 * In-memory event store for loyalty data.
 *
 * Transactions are stored as immutable events. Account state is a mutable
 * projection kept in sync by the service layer. Swap this implementation
 * with a database-backed store for production use.
 */
export class LoyaltyStore {
  private static instance: LoyaltyStore;

  private accounts = new Map<string, LoyaltyAccount>();
  private transactions: PointsTransaction[] = [];
  private campaigns = new Map<string, Campaign>();
  private expiredTxIds = new Set<string>();

  private constructor() {}

  static getInstance(): LoyaltyStore {
    if (!LoyaltyStore.instance) {
      LoyaltyStore.instance = new LoyaltyStore();
    }
    return LoyaltyStore.instance;
  }

  /** Reset all data — intended for test isolation only. */
  static resetForTesting(): void {
    LoyaltyStore.instance = new LoyaltyStore();
  }

  // ---------------------------------------------------------------------------
  // Accounts
  // ---------------------------------------------------------------------------

  getAccount(userId: string): LoyaltyAccount | undefined {
    return this.accounts.get(userId);
  }

  getOrCreateAccount(userId: string): LoyaltyAccount {
    const existing = this.accounts.get(userId);
    if (existing) return { ...existing };

    const now = new Date();
    const account: LoyaltyAccount = {
      userId,
      tier: LoyaltyTier.BRONZE,
      totalPoints: 0,
      availablePoints: 0,
      lifetimeBookings: 0,
      lifetimeSpent: 0,
      tierUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.accounts.set(userId, account);
    return { ...account };
  }

  updateAccount(account: LoyaltyAccount): void {
    account.updatedAt = new Date();
    this.accounts.set(account.userId, { ...account });
  }

  getAllAccounts(): LoyaltyAccount[] {
    return Array.from(this.accounts.values());
  }

  // ---------------------------------------------------------------------------
  // Transactions (events)
  // ---------------------------------------------------------------------------

  appendTransaction(
    tx: Omit<PointsTransaction, 'id' | 'createdAt'>,
  ): PointsTransaction {
    const transaction: PointsTransaction = {
      ...tx,
      id: uuidv4(),
      createdAt: new Date(),
    };
    this.transactions.push(transaction);
    return transaction;
  }

  getTransactions(query: PointsHistoryQuery): PaginatedResult<PointsTransaction> {
    let filtered = this.transactions.filter(tx => tx.userId === query.userId);

    if (query.type) {
      filtered = filtered.filter(tx => tx.type === query.type);
    }
    if (query.startDate) {
      const start = query.startDate;
      filtered = filtered.filter(tx => tx.createdAt >= start);
    }
    if (query.endDate) {
      const end = query.endDate;
      filtered = filtered.filter(tx => tx.createdAt <= end);
    }

    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const offset = (query.page - 1) * query.limit;
    const data = filtered.slice(offset, offset + query.limit);

    return { data, total, page: query.page, limit: query.limit, totalPages };
  }

  getTransactionsByUser(userId: string): PointsTransaction[] {
    return this.transactions
      .filter(tx => tx.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getTransactionsByBooking(bookingId: string): PointsTransaction[] {
    return this.transactions.filter(tx => tx.bookingId === bookingId);
  }

  /**
   * Return earned transactions whose expiration date has passed and that
   * have not already been marked as expired.
   */
  getExpiringTransactions(userId: string, beforeDate: Date): PointsTransaction[] {
    return this.transactions.filter(
      tx =>
        tx.userId === userId &&
        tx.type === PointsTransactionType.EARNED &&
        tx.expiresAt !== undefined &&
        tx.expiresAt <= beforeDate &&
        tx.points > 0 &&
        !this.expiredTxIds.has(tx.id),
    );
  }

  markTransactionExpired(txId: string): void {
    this.expiredTxIds.add(txId);
  }

  // ---------------------------------------------------------------------------
  // Campaigns
  // ---------------------------------------------------------------------------

  getCampaign(id: string): Campaign | undefined {
    return this.campaigns.get(id);
  }

  upsertCampaign(campaign: Campaign): void {
    this.campaigns.set(campaign.id, { ...campaign });
  }

  getActiveCampaigns(at?: Date): Campaign[] {
    const now = at ?? new Date();
    return Array.from(this.campaigns.values()).filter(
      c => c.active && c.startDate <= now && c.endDate >= now,
    );
  }

  getAllCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values());
  }
}
