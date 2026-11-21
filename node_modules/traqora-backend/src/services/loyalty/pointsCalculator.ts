import {
  BookingForPoints,
  LoyaltyTier,
  PointsBreakdownItem,
  PointsCalculationResult,
  PointsTransactionType,
} from '../../types/loyalty';
import { getTierConfig, BASE_POINTS_PER_DOLLAR, POINTS_EXPIRATION_MS } from './tierConfig';
import { LoyaltyStore } from './store';
import { CampaignManager } from './campaignManager';
import { TierManager } from './tierManager';
import { logger } from '../../utils/logger';

export class PointsCalculator {
  private store: LoyaltyStore;
  private campaignManager: CampaignManager;
  private tierManager: TierManager;

  constructor(
    store: LoyaltyStore,
    campaignManager: CampaignManager,
    tierManager: TierManager,
  ) {
    this.store = store;
    this.campaignManager = campaignManager;
    this.tierManager = tierManager;
  }

  /**
   * Preview points that *would* be earned for a booking without
   * persisting anything. Useful for showing users an estimate.
   */
  preview(booking: BookingForPoints, tier: LoyaltyTier): PointsCalculationResult {
    return this.calculate(booking, tier);
  }

  /**
   * Award points for a completed booking.
   *
   * 1. Computes base + tier + campaign points
   * 2. Persists individual transaction events for full auditability
   * 3. Updates the user's account balance
   * 4. Triggers a tier re-evaluation
   */
  award(booking: BookingForPoints): PointsCalculationResult {
    if (booking.amount <= 0) {
      throw new Error('Booking amount must be positive');
    }
    if (!booking.userId) {
      throw new Error('User ID is required');
    }
    if (!booking.bookingId) {
      throw new Error('Booking ID is required');
    }

    const account = this.store.getOrCreateAccount(booking.userId);
    const result = this.calculate(booking, account.tier);

    if (result.totalPoints <= 0) {
      return result;
    }

    const expiresAt = new Date(booking.completedAt.getTime() + POINTS_EXPIRATION_MS);

    // Record the tier-multiplied base points as an EARNED event
    if (result.tierMultiplierApplied > 0) {
      this.store.appendTransaction({
        userId: booking.userId,
        points: result.tierMultiplierApplied,
        type: PointsTransactionType.EARNED,
        bookingId: booking.bookingId,
        description: `Points earned for booking ${booking.bookingId}`,
        expiresAt,
      });
    }

    // Record tier bonus separately so it shows in the history
    if (result.tierBonusPoints > 0) {
      this.store.appendTransaction({
        userId: booking.userId,
        points: result.tierBonusPoints,
        type: PointsTransactionType.BONUS,
        bookingId: booking.bookingId,
        description: `Tier bonus (${account.tier}) for booking ${booking.bookingId}`,
        expiresAt,
      });
    }

    // Record each campaign bonus as its own event
    for (const item of result.breakdown) {
      if (item.source.startsWith('campaign:')) {
        const campaignId = item.source.replace('campaign:', '');
        this.store.appendTransaction({
          userId: booking.userId,
          points: item.points,
          type: PointsTransactionType.BONUS,
          bookingId: booking.bookingId,
          campaignId,
          description: item.description,
          expiresAt,
        });
      }
    }

    // Refresh account from store (may have been mutated by getOrCreate)
    const latest = this.store.getOrCreateAccount(booking.userId);
    latest.totalPoints += result.totalPoints;
    latest.availablePoints += result.totalPoints;
    latest.lifetimeBookings += 1;
    latest.lifetimeSpent += booking.amount;
    this.store.updateAccount(latest);

    // Re-evaluate tier after balance change
    this.tierManager.evaluateTier(booking.userId);

    logger.info({
      msg: 'Points awarded',
      userId: booking.userId,
      bookingId: booking.bookingId,
      totalPoints: result.totalPoints,
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // Internal calculation — pure function of inputs, no side effects
  // ---------------------------------------------------------------------------

  private calculate(
    booking: BookingForPoints,
    tier: LoyaltyTier,
  ): PointsCalculationResult {
    const tierConfig = getTierConfig(tier);
    const breakdown: PointsBreakdownItem[] = [];

    // Step 1 — base points (1 pt / $1)
    const basePoints = Math.floor(booking.amount * BASE_POINTS_PER_DOLLAR);

    // Step 2 — tier multiplier (mirrors on-chain award_points)
    const tierMultipliedPoints = Math.floor(
      (basePoints * tierConfig.pointsMultiplier) / 100,
    );
    breakdown.push({
      source: 'tier_multiplier',
      points: tierMultipliedPoints,
      description: `Base ${basePoints} pts \u00d7 ${tierConfig.pointsMultiplier / 100}x (${tier})`,
    });

    // Step 3 — tier bonus percentage (off-chain enrichment)
    const tierBonusPoints =
      tierConfig.bonusPercentage > 0
        ? Math.floor((basePoints * tierConfig.bonusPercentage) / 10000)
        : 0;

    if (tierBonusPoints > 0) {
      breakdown.push({
        source: 'tier_bonus',
        points: tierBonusPoints,
        description: `${tierConfig.bonusPercentage / 100}% tier bonus (${tier})`,
      });
    }

    // Step 4 — campaign bonuses
    const activeCampaigns = this.campaignManager.getApplicableCampaigns(
      booking,
      tier,
      booking.completedAt,
    );

    let campaignBonusPoints = 0;
    for (const campaign of activeCampaigns) {
      const bonus = this.campaignManager.calculateCampaignBonus(basePoints, campaign);
      if (bonus > 0) {
        campaignBonusPoints += bonus;
        breakdown.push({
          source: `campaign:${campaign.id}`,
          points: bonus,
          description: `${campaign.name} campaign bonus`,
        });
      }
    }

    const totalPoints = tierMultipliedPoints + tierBonusPoints + campaignBonusPoints;

    return {
      basePoints,
      tierMultiplierApplied: tierMultipliedPoints,
      tierBonusPoints,
      campaignBonusPoints,
      totalPoints,
      breakdown,
    };
  }
}
