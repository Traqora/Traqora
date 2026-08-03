import {
  getTierInfo,
  calculateTierProgression,
  getTierHistoryEntries,
  TIERS,
} from '../../src/services/loyalty-tiers';
import { LoyaltyTier, LoyaltyAccount } from '../../src/types/loyalty';

function makeAccount(overrides: Partial<LoyaltyAccount> = {}): LoyaltyAccount {
  return {
    userId: 'user-1',
    tier: LoyaltyTier.BRONZE,
    totalPoints: 0,
    availablePoints: 0,
    lifetimeBookings: 0,
    lifetimeSpent: 0,
    tierUpdatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getTierInfo', () => {
  it('returns the correct TierInfo for each defined tier', () => {
    for (const tier of Object.values(LoyaltyTier)) {
      const info = getTierInfo(tier as LoyaltyTier);
      expect(info).toBeDefined();
      expect(info!.tier).toBe(tier);
      expect(info!.benefits.length).toBeGreaterThan(0);
    }
  });

  it('returns undefined for an unknown tier value', () => {
    expect(getTierInfo('unknown' as LoyaltyTier)).toBeUndefined();
  });

  it('Diamond tier has the most benefits of all tiers', () => {
    const diamond = getTierInfo(LoyaltyTier.DIAMOND)!;
    for (const t of TIERS) {
      expect(diamond.benefits.length).toBeGreaterThanOrEqual(t.benefits.length);
    }
  });
});

describe('calculateTierProgression', () => {
  it('returns Bronze as the current tier for a zero-point account', () => {
    const result = calculateTierProgression(makeAccount({ tier: LoyaltyTier.BRONZE, totalPoints: 0 }));
    expect(result.currentTier.tier).toBe(LoyaltyTier.BRONZE);
    expect(result.nextTier).not.toBeNull();
    expect(result.pointsRemaining).toBeGreaterThan(0);
    expect(result.progressPercent).toBe(0);
  });

  it('shows correct points remaining when partway to the next tier', () => {
    const silver = getTierInfo(LoyaltyTier.SILVER)!;
    const halfway = Math.floor(silver.minPoints / 2);
    const result = calculateTierProgression(
      makeAccount({ tier: LoyaltyTier.BRONZE, totalPoints: halfway }),
    );
    expect(result.pointsRemaining).toBe(silver.minPoints - halfway);
    expect(result.progressPercent).toBeCloseTo(50, 0);
  });

  it('returns 100% progress and no nextTier for a Diamond account', () => {
    const diamond = getTierInfo(LoyaltyTier.DIAMOND)!;
    const result = calculateTierProgression(
      makeAccount({ tier: LoyaltyTier.DIAMOND, totalPoints: diamond.minPoints }),
    );
    expect(result.nextTier).toBeNull();
    expect(result.pointsRemaining).toBe(0);
    expect(result.progressPercent).toBe(100);
  });

  it('clamps progressPercent to 100 when points exceed the next tier threshold', () => {
    const silver = getTierInfo(LoyaltyTier.SILVER)!;
    const result = calculateTierProgression(
      makeAccount({ tier: LoyaltyTier.BRONZE, totalPoints: silver.minPoints + 9999 }),
    );
    expect(result.progressPercent).toBe(100);
  });

  it('falls back gracefully when the account has an unrecognised tier', () => {
    const result = calculateTierProgression(
      makeAccount({ tier: 'unknown' as LoyaltyTier, totalPoints: 500 }),
    );
    expect(result.currentTier.tier).toBe(LoyaltyTier.BRONZE);
    expect(result.nextTier).not.toBeNull();
  });
});

describe('getTierHistoryEntries', () => {
  it('maps tier history to named entries in order', () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 86400_000);
    const history = [
      { tier: LoyaltyTier.BRONZE, changedAt: earlier },
      { tier: LoyaltyTier.SILVER, changedAt: now },
    ];
    const entries = getTierHistoryEntries(history);
    expect(entries).toHaveLength(2);
    expect(entries[0].tier).toBe(LoyaltyTier.BRONZE);
    expect(entries[0].name).toBe('Bronze');
    expect(entries[1].tier).toBe(LoyaltyTier.SILVER);
    expect(entries[1].name).toBe('Silver');
    expect(entries[1].changedAt).toBe(now);
  });

  it('returns an empty array for an empty history', () => {
    expect(getTierHistoryEntries([])).toEqual([]);
  });

  it('uses "Unknown" as the name for an unrecognised tier in history', () => {
    const entries = getTierHistoryEntries([
      { tier: 'legacy_gold' as LoyaltyTier, changedAt: new Date() },
    ]);
    expect(entries[0].name).toBe('Unknown');
  });
});
