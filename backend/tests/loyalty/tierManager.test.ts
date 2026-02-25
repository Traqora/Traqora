import { LoyaltyStore } from '../../src/services/loyalty/store';
import { TierManager } from '../../src/services/loyalty/tierManager';
import { LoyaltyTier } from '../../src/types/loyalty';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('TierManager', () => {
  let store: LoyaltyStore;
  let tierManager: TierManager;

  beforeEach(() => {
    LoyaltyStore.resetForTesting();
    store = LoyaltyStore.getInstance();
    tierManager = new TierManager(store);
  });

  // -------------------------------------------------------------------------
  // determineTier
  // -------------------------------------------------------------------------

  describe('determineTier', () => {
    it('returns Bronze for zero points and zero bookings', () => {
      expect(tierManager.determineTier(0, 0)).toBe(LoyaltyTier.BRONZE);
    });

    it('returns Bronze when points are high but bookings are insufficient', () => {
      expect(tierManager.determineTier(50000, 0)).toBe(LoyaltyTier.BRONZE);
    });

    it('returns Bronze when bookings are high but points are insufficient', () => {
      expect(tierManager.determineTier(0, 100)).toBe(LoyaltyTier.BRONZE);
    });

    it('returns Silver at exactly 1000 points and 5 bookings', () => {
      expect(tierManager.determineTier(1000, 5)).toBe(LoyaltyTier.SILVER);
    });

    it('returns Gold at exactly 5000 points and 20 bookings', () => {
      expect(tierManager.determineTier(5000, 20)).toBe(LoyaltyTier.GOLD);
    });

    it('returns Platinum at exactly 20000 points and 50 bookings', () => {
      expect(tierManager.determineTier(20000, 50)).toBe(LoyaltyTier.PLATINUM);
    });

    it('returns Platinum for very high values', () => {
      expect(tierManager.determineTier(999999, 999)).toBe(LoyaltyTier.PLATINUM);
    });

    it('returns Silver when points qualify for Gold but bookings only for Silver', () => {
      expect(tierManager.determineTier(10000, 10)).toBe(LoyaltyTier.SILVER);
    });
  });

  // -------------------------------------------------------------------------
  // evaluateTier (upgrade / downgrade)
  // -------------------------------------------------------------------------

  describe('evaluateTier', () => {
    it('upgrades a Bronze user to Silver when thresholds are met', () => {
      const acct = store.getOrCreateAccount('user-1');
      acct.totalPoints = 1500;
      acct.lifetimeBookings = 6;
      store.updateAccount(acct);

      const result = tierManager.evaluateTier('user-1');

      expect(result.changed).toBe(true);
      expect(result.previousTier).toBe(LoyaltyTier.BRONZE);
      expect(result.newTier).toBe(LoyaltyTier.SILVER);

      const updated = store.getAccount('user-1');
      expect(updated!.tier).toBe(LoyaltyTier.SILVER);
    });

    it('downgrades when points drop below tier threshold', () => {
      const acct = store.getOrCreateAccount('user-2');
      acct.tier = LoyaltyTier.GOLD;
      acct.totalPoints = 800;
      acct.lifetimeBookings = 25;
      store.updateAccount(acct);

      const result = tierManager.evaluateTier('user-2');

      expect(result.changed).toBe(true);
      expect(result.previousTier).toBe(LoyaltyTier.GOLD);
      expect(result.newTier).toBe(LoyaltyTier.BRONZE);
    });

    it('returns changed=false when tier stays the same', () => {
      const acct = store.getOrCreateAccount('user-3');
      acct.totalPoints = 50;
      acct.lifetimeBookings = 1;
      store.updateAccount(acct);

      const result = tierManager.evaluateTier('user-3');
      expect(result.changed).toBe(false);
      expect(result.previousTier).toBe(LoyaltyTier.BRONZE);
      expect(result.newTier).toBe(LoyaltyTier.BRONZE);
    });

    it('throws when account does not exist', () => {
      expect(() => tierManager.evaluateTier('nonexistent')).toThrow(
        'Loyalty account not found',
      );
    });

    it('updates tierUpdatedAt on change', () => {
      const acct = store.getOrCreateAccount('user-4');
      const originalDate = acct.tierUpdatedAt;
      acct.totalPoints = 2000;
      acct.lifetimeBookings = 5;
      store.updateAccount(acct);

      tierManager.evaluateTier('user-4');

      const updated = store.getAccount('user-4');
      expect(updated!.tierUpdatedAt.getTime()).toBeGreaterThanOrEqual(
        originalDate.getTime(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // evaluateAllTiers
  // -------------------------------------------------------------------------

  describe('evaluateAllTiers', () => {
    it('returns only accounts whose tier changed', () => {
      const a1 = store.getOrCreateAccount('u1');
      a1.totalPoints = 1500;
      a1.lifetimeBookings = 6;
      store.updateAccount(a1);

      store.getOrCreateAccount('u2'); // stays Bronze

      const results = tierManager.evaluateAllTiers();
      expect(results.length).toBe(1);
      expect(results[0].userId).toBe('u1');
    });
  });

  // -------------------------------------------------------------------------
  // getNextTier
  // -------------------------------------------------------------------------

  describe('getNextTier', () => {
    it('returns Silver as next tier for Bronze', () => {
      const next = tierManager.getNextTier(LoyaltyTier.BRONZE);
      expect(next).not.toBeNull();
      expect(next!.tier).toBe(LoyaltyTier.SILVER);
      expect(next!.pointsNeeded).toBe(1000);
      expect(next!.bookingsNeeded).toBe(5);
    });

    it('returns Gold as next tier for Silver', () => {
      const next = tierManager.getNextTier(LoyaltyTier.SILVER);
      expect(next!.tier).toBe(LoyaltyTier.GOLD);
    });

    it('returns Platinum as next tier for Gold', () => {
      const next = tierManager.getNextTier(LoyaltyTier.GOLD);
      expect(next!.tier).toBe(LoyaltyTier.PLATINUM);
    });

    it('returns null for Platinum (already max)', () => {
      expect(tierManager.getNextTier(LoyaltyTier.PLATINUM)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getTierProgress
  // -------------------------------------------------------------------------

  describe('getTierProgress', () => {
    it('returns fractional progress toward Silver for a Bronze user', () => {
      const acct = store.getOrCreateAccount('user-prog');
      acct.totalPoints = 500;
      acct.lifetimeBookings = 2;
      store.updateAccount(acct);

      const progress = tierManager.getTierProgress(acct);

      expect(progress.currentTier).toBe(LoyaltyTier.BRONZE);
      expect(progress.nextTier).toBe(LoyaltyTier.SILVER);
      expect(progress.pointsProgress).toBeCloseTo(0.5);
      expect(progress.bookingsProgress).toBeCloseTo(0.4);
    });

    it('returns 1.0 progress for Platinum (no next tier)', () => {
      const acct = store.getOrCreateAccount('user-plat');
      acct.tier = LoyaltyTier.PLATINUM;
      acct.totalPoints = 50000;
      acct.lifetimeBookings = 100;
      store.updateAccount(acct);

      const progress = tierManager.getTierProgress(acct);
      expect(progress.nextTier).toBeNull();
      expect(progress.pointsProgress).toBe(1);
      expect(progress.bookingsProgress).toBe(1);
    });
  });
});
