import { LoyaltyTier, LoyaltyAccount } from '../../types/loyalty';
import { getTierConfigsSorted, getTierConfig } from './tierConfig';
import { LoyaltyStore } from './store';
import { logger } from '../../utils/logger';

export interface TierChangeResult {
  userId: string;
  previousTier: LoyaltyTier;
  newTier: LoyaltyTier;
  changed: boolean;
  /**
   * Set when the evaluation was skipped because the account was already
   * processed within the same recalculation run (idempotency guard).
   */
  skipped?: boolean;
}

const TIER_ORDER: ReadonlyArray<LoyaltyTier> = [
  LoyaltyTier.BRONZE,
  LoyaltyTier.SILVER,
  LoyaltyTier.GOLD,
  LoyaltyTier.PLATINUM,
];

export class TierManager {
  private store: LoyaltyStore;

  /**
   * Tracks which (runId, userId) pairs have already been processed so that
   * calling evaluateTier / recalculateAllTiers with the same runId a second
   * time is a no-op for accounts already visited.
   *
   * Keys are "<runId>:<userId>".
   */
  private processedInRun = new Map<string, TierChangeResult>();

  constructor(store: LoyaltyStore) {
    this.store = store;
  }

  /**
   * Determine the highest tier a user qualifies for based on their
   * accumulated points and lifetime bookings. Mirrors the on-chain
   * `check_tier_upgrade` logic by iterating tiers from highest to lowest.
   *
   * This function is pure: same inputs always produce the same output and
   * it has no side-effects, making the overall recalculation order-independent.
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
   *
   * Idempotency: when a `runId` is supplied the result is memoised; calling
   * this method again with the same runId and userId returns the cached result
   * without re-reading or re-writing the store.  This makes it safe to call
   * from multiple code-paths during a single recalculation batch.
   *
   * Without a runId the method is still idempotent in the "same input → same
   * output" sense: if the account already carries the correct tier, the store
   * is not mutated.
   */
  evaluateTier(userId: string, runId?: string): TierChangeResult {
    if (runId) {
      const cacheKey = `${runId}:${userId}`;
      const cached = this.processedInRun.get(cacheKey);
      if (cached) {
        logger.debug({ msg: 'Tier evaluation skipped (already processed in run)', userId, runId });
        return { ...cached, skipped: true };
      }
    }

    const account = this.store.getAccount(userId);
    if (!account) {
      throw new Error(`Loyalty account not found: ${userId}`);
    }

    const previousTier = account.tier;
    const newTier = this.determineTier(account.totalPoints, account.lifetimeBookings);

    if (newTier !== previousTier) {
      // Recompute from the account's points/bookings only. Updating a copy
      // keeps a failed persistence operation from mutating the stored
      // projection before the change has been committed.
      this.store.updateAccount({
        ...account,
        tier: newTier,
        tierUpdatedAt: new Date(),
      });

      const direction =
        this.tierRank(newTier) > this.tierRank(previousTier)
          ? 'upgraded'
          : 'downgraded';

      logger.info({
        msg: `User tier ${direction}`,
        userId,
        from: previousTier,
        to: newTier,
        runId,
      });
    }

    const result: TierChangeResult = {
      userId,
      previousTier,
      newTier,
      changed: newTier !== previousTier,
    };

    if (runId) {
      this.processedInRun.set(`${runId}:${userId}`, result);
    }

    return result;
  }

  /**
   * Batch-evaluate all accounts. Useful after bulk expiration processing.
   * Returns only the accounts whose tier actually changed.
   *
   * The result is independent of the order accounts are stored: each account's
   * new tier is determined solely by its own points and booking counts.
   */
  evaluateAllTiers(runId?: string): TierChangeResult[] {
    return this.store
      .getAllAccounts()
      .map(a => this.evaluateTier(a.userId, runId))
      .filter(r => r.changed && !r.skipped);
  }

  /**
   * Idempotent recalculation for all accounts under a caller-supplied `runId`.
   *
   * Re-calling with the same `runId` returns the same results without
   * touching the store again.  This is the preferred API for scheduled
   * recalculation jobs that may be retried.
   */
  recalculateAllTiers(runId: string): TierChangeResult[] {
    return this.evaluateAllTiers(runId);
  }

  /**
   * Discard the memoisation cache for a given runId.
   * Useful in tests or when a new recalculation batch should start fresh.
   */
  clearRunCache(runId: string): void {
    for (const key of this.processedInRun.keys()) {
      if (key.startsWith(`${runId}:`)) {
        this.processedInRun.delete(key);
      }
    }
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
