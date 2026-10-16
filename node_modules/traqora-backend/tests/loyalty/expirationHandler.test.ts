import { LoyaltyStore } from '../../src/services/loyalty/store';
import { TierManager } from '../../src/services/loyalty/tierManager';
import { ExpirationHandler } from '../../src/services/loyalty/expirationHandler';
import { PointsTransactionType, LoyaltyTier } from '../../src/types/loyalty';
import { POINTS_EXPIRATION_MS } from '../../src/services/loyalty/tierConfig';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ExpirationHandler', () => {
  let store: LoyaltyStore;
  let tierManager: TierManager;
  let handler: ExpirationHandler;

  beforeEach(() => {
    LoyaltyStore.resetForTesting();
    store = LoyaltyStore.getInstance();
    tierManager = new TierManager(store);
    handler = new ExpirationHandler(store, tierManager);
  });

  function seedEarnedTransaction(
    userId: string,
    points: number,
    expiresAt: Date,
  ): void {
    store.appendTransaction({
      userId,
      points,
      type: PointsTransactionType.EARNED,
      bookingId: `BK-${Math.random().toString(36).slice(2, 7)}`,
      description: 'Test earned',
      expiresAt,
    });
  }

  // -------------------------------------------------------------------------
  // processUserExpirations
  // -------------------------------------------------------------------------

  describe('processUserExpirations', () => {
    it('expires points past their expiration date', () => {
      const acct = store.getOrCreateAccount('user-1');
      acct.totalPoints = 300;
      acct.availablePoints = 300;
      store.updateAccount(acct);

      const pastDate = new Date(Date.now() - 1000);
      seedEarnedTransaction('user-1', 200, pastDate);
      seedEarnedTransaction('user-1', 100, pastDate);

      const result = handler.processUserExpirations('user-1');

      expect(result.expiredPoints).toBe(300);
      expect(result.transactionsProcessed).toBe(2);

      const updated = store.getAccount('user-1');
      expect(updated!.totalPoints).toBe(0);
      expect(updated!.availablePoints).toBe(0);
    });

    it('does not expire points that have not reached their expiration date', () => {
      const acct = store.getOrCreateAccount('user-2');
      acct.totalPoints = 500;
      acct.availablePoints = 500;
      store.updateAccount(acct);

      const futureDate = new Date(Date.now() + POINTS_EXPIRATION_MS);
      seedEarnedTransaction('user-2', 500, futureDate);

      const result = handler.processUserExpirations('user-2');

      expect(result.expiredPoints).toBe(0);
      expect(result.transactionsProcessed).toBe(0);

      const updated = store.getAccount('user-2');
      expect(updated!.totalPoints).toBe(500);
    });

    it('only expires some transactions when dates are mixed', () => {
      const acct = store.getOrCreateAccount('user-3');
      acct.totalPoints = 800;
      acct.availablePoints = 800;
      store.updateAccount(acct);

      seedEarnedTransaction('user-3', 300, new Date(Date.now() - 1000));
      seedEarnedTransaction('user-3', 500, new Date(Date.now() + POINTS_EXPIRATION_MS));

      const result = handler.processUserExpirations('user-3');

      expect(result.expiredPoints).toBe(300);
      expect(result.transactionsProcessed).toBe(1);

      const updated = store.getAccount('user-3');
      expect(updated!.totalPoints).toBe(500);
    });

    it('does not double-expire the same transaction', () => {
      const acct = store.getOrCreateAccount('user-4');
      acct.totalPoints = 100;
      acct.availablePoints = 100;
      store.updateAccount(acct);

      seedEarnedTransaction('user-4', 100, new Date(Date.now() - 1000));

      handler.processUserExpirations('user-4');
      const second = handler.processUserExpirations('user-4');

      expect(second.expiredPoints).toBe(0);
      expect(second.transactionsProcessed).toBe(0);
    });

    it('returns zeros for nonexistent user', () => {
      const result = handler.processUserExpirations('ghost');
      expect(result.expiredPoints).toBe(0);
    });

    it('floors balance at zero to prevent negative points', () => {
      const acct = store.getOrCreateAccount('user-5');
      acct.totalPoints = 50;
      acct.availablePoints = 50;
      store.updateAccount(acct);

      seedEarnedTransaction('user-5', 200, new Date(Date.now() - 1000));

      const result = handler.processUserExpirations('user-5');
      expect(result.expiredPoints).toBe(200);

      const updated = store.getAccount('user-5');
      expect(updated!.totalPoints).toBe(0);
      expect(updated!.availablePoints).toBe(0);
    });

    it('triggers tier downgrade after expiration', () => {
      const acct = store.getOrCreateAccount('user-6');
      acct.tier = LoyaltyTier.SILVER;
      acct.totalPoints = 1200;
      acct.availablePoints = 1200;
      acct.lifetimeBookings = 6;
      store.updateAccount(acct);

      seedEarnedTransaction('user-6', 1200, new Date(Date.now() - 1000));

      handler.processUserExpirations('user-6');

      const updated = store.getAccount('user-6');
      expect(updated!.tier).toBe(LoyaltyTier.BRONZE);
    });
  });

  // -------------------------------------------------------------------------
  // processAllExpirations
  // -------------------------------------------------------------------------

  describe('processAllExpirations', () => {
    it('processes multiple users and returns only affected ones', () => {
      const a1 = store.getOrCreateAccount('u-a');
      a1.totalPoints = 100;
      a1.availablePoints = 100;
      store.updateAccount(a1);
      seedEarnedTransaction('u-a', 100, new Date(Date.now() - 1000));

      const a2 = store.getOrCreateAccount('u-b');
      a2.totalPoints = 200;
      a2.availablePoints = 200;
      store.updateAccount(a2);
      seedEarnedTransaction('u-b', 200, new Date(Date.now() + POINTS_EXPIRATION_MS));

      const results = handler.processAllExpirations();

      expect(results).toHaveLength(1);
      expect(results[0].userId).toBe('u-a');
    });
  });

  // -------------------------------------------------------------------------
  // getUpcomingExpirations
  // -------------------------------------------------------------------------

  describe('getUpcomingExpirations', () => {
    it('returns count and sum of soon-to-expire points', () => {
      store.getOrCreateAccount('user-preview');

      const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      seedEarnedTransaction('user-preview', 150, soon);
      seedEarnedTransaction('user-preview', 250, soon);

      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const result = handler.getUpcomingExpirations('user-preview', thirtyDaysOut);

      expect(result.points).toBe(400);
      expect(result.count).toBe(2);
    });

    it('returns zero when no points are expiring soon', () => {
      store.getOrCreateAccount('user-safe');
      seedEarnedTransaction(
        'user-safe',
        1000,
        new Date(Date.now() + POINTS_EXPIRATION_MS),
      );

      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const result = handler.getUpcomingExpirations('user-safe', thirtyDaysOut);

      expect(result.points).toBe(0);
      expect(result.count).toBe(0);
    });
  });
});
