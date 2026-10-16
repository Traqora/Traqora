import { LoyaltyTier, LoyaltyAccount } from '../../types/loyalty';
import { getTierConfigsSorted, getTierConfig } from './tierConfig';
import { LoyaltyStore } from './store';
import { logger } from '../../utils/logger';

export interface TierChangeResult {
  userId: string;
  previousTier: LoyaltyTier;
  newTier: LoyaltyTier;
  changed: boolean;
}

const TIER_ORDER: ReadonlyArray<LoyaltyTier> = [
  LoyaltyTier.BRONZE,
  LoyaltyTier.SILVER,
  LoyaltyTier.GOLD,
  LoyaltyTier.PLATINUM,
];

export class TierManager {
  private store: LoyaltyStore;

  constructor(store: LoyaltyStore) {
    this.store = store;
  }

  /**
   * Determine the highest tier a user qualifies for based on their
   * accumulated points and lifetime bookings. Mirrors the on-chain
   * `check_tier_upgrade` logic by iterating tiers from highest to lowest.
   */
  determineTier(totalPoints: number, lifetimeBookings: number): LoyaltyTier {
    for (const cfg of getTierConfigsSorted()) {
      if (totalPoints >= cfg.minPoints && lifetimeBookings >= cfg.minBookings) {
        return cfg.tier;
      }
    }
    return LoyaltyTier.BRONZE;
  }

  /**
   * Evaluate and persist a tier change (upgrade or downgrade) for a user.
   */
  evaluateTier(userId: string): TierChangeResult {
    const account = this.store.getAccount(userId);
    if (!account) {
      throw new Error(`Loyalty account not found: ${userId}`);
    }

    const previousTier = account.tier;
    const newTier = this.determineTier(account.totalPoints, account.lifetimeBookings);

    if (newTier !== previousTier) {
      account.tier = newTier;
      account.tierUpdatedAt = new Date();
      this.store.updateAccount(account);

      const direction =
        this.tierRank(newTier) > this.tierRank(previousTier)
          ? 'upgraded'
          : 'downgraded';

      logger.info({
        msg: `User tier ${direction}`,
        userId,
        from: previousTier,
        to: newTier,
      });
    }

    return { userId, previousTier, newTier, changed: newTier !== previousTier };
  }

  /**
   * Batch-evaluate all accounts. Useful after bulk expiration processing.
   * Returns only the accounts whose tier actually changed.
   */
  evaluateAllTiers(): TierChangeResult[] {
    return this.store
      .getAllAccounts()
      .map(a => this.evaluateTier(a.userId))
      .filter(r => r.changed);
  }

  /**
   * Return the next tier above the current one together with the
   * thresholds required to reach it, or `null` when already at Platinum.
   */
  getNextTier(
    currentTier: LoyaltyTier,
  ): { tier: LoyaltyTier; pointsNeeded: number; bookingsNeeded: number } | null {
    const rank = this.tierRank(currentTier);
    if (rank >= TIER_ORDER.length - 1) return null;

    const next = TIER_ORDER[rank + 1];
    const cfg = getTierConfig(next);
    return {
      tier: next,
      pointsNeeded: cfg.minPoints,
      bookingsNeeded: cfg.minBookings,
    };
  }

  /** Return a user-friendly progress summary toward the next tier. */
  getTierProgress(account: LoyaltyAccount): {
    currentTier: LoyaltyTier;
    nextTier: LoyaltyTier | null;
    pointsProgress: number;
    bookingsProgress: number;
  } {
    const next = this.getNextTier(account.tier);
    if (!next) {
      return {
        currentTier: account.tier,
        nextTier: null,
        pointsProgress: 1,
        bookingsProgress: 1,
      };
    }

    return {
      currentTier: account.tier,
      nextTier: next.tier,
      pointsProgress: Math.min(1, account.totalPoints / next.pointsNeeded),
      bookingsProgress: Math.min(1, account.lifetimeBookings / next.bookingsNeeded),
    };
  }

  private tierRank(tier: LoyaltyTier): number {
    return TIER_ORDER.indexOf(tier);
  }
}
