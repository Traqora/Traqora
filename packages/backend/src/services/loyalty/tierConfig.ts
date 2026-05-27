import { TierConfig, LoyaltyTier } from '../../types/loyalty';

/**
 * Tier configurations matching the on-chain loyalty smart contract.
 * Multipliers and bonuses are in basis points (100 = 1x, 150 = 1.5x).
 */
export const TIER_CONFIGS: ReadonlyArray<TierConfig> = [
  {
    tier: LoyaltyTier.BRONZE,
    minPoints: 0,
    minBookings: 0,
    pointsMultiplier: 100,
    bonusPercentage: 0,
  },
  {
    tier: LoyaltyTier.SILVER,
    minPoints: 1000,
    minBookings: 5,
    pointsMultiplier: 125,
    bonusPercentage: 500,
  },
  {
    tier: LoyaltyTier.GOLD,
    minPoints: 5000,
    minBookings: 20,
    pointsMultiplier: 150,
    bonusPercentage: 1000,
  },
  {
    tier: LoyaltyTier.PLATINUM,
    minPoints: 20000,
    minBookings: 50,
    pointsMultiplier: 200,
    bonusPercentage: 2000,
  },
];

const TIERS_DESCENDING = [...TIER_CONFIGS].sort(
  (a, b) => b.minPoints - a.minPoints
);

export function getTierConfig(tier: LoyaltyTier): TierConfig {
  const found = TIER_CONFIGS.find(c => c.tier === tier);
  if (!found) {
    throw new Error(`Unknown loyalty tier: ${tier}`);
  }
  return found;
}

export function getTierConfigsSorted(): ReadonlyArray<TierConfig> {
  return TIERS_DESCENDING;
}

/** Points expire after 12 months from the date they were earned. */
export const POINTS_EXPIRATION_MS = 365 * 24 * 60 * 60 * 1000;

/** Base conversion rate: 1 point per dollar spent. */
export const BASE_POINTS_PER_DOLLAR = 1;

/** Redemption rate: 100 points = $1 discount. */
export const POINTS_PER_DOLLAR_REDEMPTION = 100;
