import { LoyaltyStore } from '../../src/services/loyalty/store';
import { PointsCalculator } from '../../src/services/loyalty/pointsCalculator';
import { CampaignManager } from '../../src/services/loyalty/campaignManager';
import { TierManager } from '../../src/services/loyalty/tierManager';
import {
  LoyaltyTier,
  CampaignType,
  BookingForPoints,
} from '../../src/types/loyalty';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('PointsCalculator', () => {
  let store: LoyaltyStore;
  let campaignManager: CampaignManager;
  let tierManager: TierManager;
  let calculator: PointsCalculator;

  beforeEach(() => {
    LoyaltyStore.resetForTesting();
    store = LoyaltyStore.getInstance();
    campaignManager = new CampaignManager(store);
    tierManager = new TierManager(store);
    calculator = new PointsCalculator(store, campaignManager, tierManager);
  });

  function makeBooking(overrides: Partial<BookingForPoints> = {}): BookingForPoints {
    return {
      bookingId: 'BK-001',
      userId: 'user-1',
      amount: 500,
      completedAt: new Date('2025-06-15T12:00:00Z'),
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // Preview (dry-run) calculations
  // -------------------------------------------------------------------------

  describe('preview', () => {
    it('calculates base points at 1 point per dollar for Bronze', () => {
      const result = calculator.preview(makeBooking({ amount: 200 }), LoyaltyTier.BRONZE);

      expect(result.basePoints).toBe(200);
      expect(result.tierMultiplierApplied).toBe(200); // 200 * 100/100
      expect(result.tierBonusPoints).toBe(0);
      expect(result.totalPoints).toBe(200);
    });

    it('applies Silver tier multiplier (1.25x) and 5% bonus', () => {
      const result = calculator.preview(makeBooking({ amount: 400 }), LoyaltyTier.SILVER);

      expect(result.basePoints).toBe(400);
      expect(result.tierMultiplierApplied).toBe(500); // 400 * 125 / 100
      expect(result.tierBonusPoints).toBe(20);        // 400 * 500 / 10000
      expect(result.totalPoints).toBe(520);
    });

    it('applies Gold tier multiplier (1.5x) and 10% bonus', () => {
      const result = calculator.preview(makeBooking({ amount: 1000 }), LoyaltyTier.GOLD);

      expect(result.basePoints).toBe(1000);
      expect(result.tierMultiplierApplied).toBe(1500); // 1000 * 150 / 100
      expect(result.tierBonusPoints).toBe(100);         // 1000 * 1000 / 10000
      expect(result.totalPoints).toBe(1600);
    });

    it('applies Platinum tier multiplier (2x) and 20% bonus', () => {
      const result = calculator.preview(makeBooking({ amount: 300 }), LoyaltyTier.PLATINUM);

      expect(result.basePoints).toBe(300);
      expect(result.tierMultiplierApplied).toBe(600); // 300 * 200 / 100
      expect(result.tierBonusPoints).toBe(60);         // 300 * 2000 / 10000
      expect(result.totalPoints).toBe(660);
    });

    it('floors fractional points', () => {
      const result = calculator.preview(makeBooking({ amount: 33.7 }), LoyaltyTier.SILVER);

      expect(result.basePoints).toBe(33);
      expect(result.tierMultiplierApplied).toBe(41);  // floor(33 * 1.25)
      expect(result.tierBonusPoints).toBe(1);           // floor(33 * 0.05)
      expect(result.totalPoints).toBe(42);
    });

    it('returns zero points for zero-amount booking', () => {
      const result = calculator.preview(makeBooking({ amount: 0 }), LoyaltyTier.BRONZE);
      expect(result.totalPoints).toBe(0);
    });

    it('includes campaign bonuses when campaigns are active', () => {
      campaignManager.createCampaign({
        name: 'Summer Sale',
        type: CampaignType.SEASONAL,
        multiplier: 2,
        flatBonus: 50,
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-06-30'),
      });

      const booking = makeBooking({ amount: 100, completedAt: new Date('2025-06-15T12:00:00Z') });
      const result = calculator.preview(booking, LoyaltyTier.BRONZE);

      // base=100, tier multiplied=100, campaign: floor(100*(2-1)) + 50 = 150
      expect(result.campaignBonusPoints).toBe(150);
      expect(result.totalPoints).toBe(250); // 100 + 0 + 150
    });
  });

  // -------------------------------------------------------------------------
  // Award (persist)
  // -------------------------------------------------------------------------

  describe('award', () => {
    it('persists transactions and updates account balance', () => {
      const result = calculator.award(makeBooking({ amount: 500 }));

      expect(result.totalPoints).toBe(500);

      const account = store.getAccount('user-1');
      expect(account).toBeDefined();
      expect(account!.totalPoints).toBe(500);
      expect(account!.lifetimeBookings).toBe(1);
      expect(account!.lifetimeSpent).toBe(500);
    });

    it('accumulates points across multiple bookings', () => {
      calculator.award(makeBooking({ bookingId: 'BK-001', amount: 200 }));
      calculator.award(makeBooking({ bookingId: 'BK-002', amount: 300 }));

      const account = store.getAccount('user-1');
      expect(account!.totalPoints).toBe(500);
      expect(account!.lifetimeBookings).toBe(2);
      expect(account!.lifetimeSpent).toBe(500);
    });

    it('creates transaction events with expiration dates', () => {
      calculator.award(makeBooking());

      const txs = store.getTransactionsByUser('user-1');
      expect(txs.length).toBeGreaterThan(0);

      const earned = txs.find(t => t.type === 'earned');
      expect(earned).toBeDefined();
      expect(earned!.expiresAt).toBeDefined();

      // Expiration should be ~365 days after completedAt
      const diff = earned!.expiresAt!.getTime() - new Date('2025-06-15T12:00:00Z').getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;
      expect(diff).toBeCloseTo(365 * oneDayMs, -3);
    });

    it('throws on non-positive booking amount', () => {
      expect(() => calculator.award(makeBooking({ amount: 0 }))).toThrow(
        'Booking amount must be positive',
      );
      expect(() => calculator.award(makeBooking({ amount: -10 }))).toThrow(
        'Booking amount must be positive',
      );
    });

    it('throws on missing userId', () => {
      expect(() => calculator.award(makeBooking({ userId: '' }))).toThrow(
        'User ID is required',
      );
    });

    it('throws on missing bookingId', () => {
      expect(() => calculator.award(makeBooking({ bookingId: '' }))).toThrow(
        'Booking ID is required',
      );
    });

    it('triggers tier upgrade when points threshold is met', () => {
      // Silver requires 1000 points and 5 bookings
      for (let i = 0; i < 5; i++) {
        calculator.award(
          makeBooking({ bookingId: `BK-${i}`, amount: 250, userId: 'user-1' }),
        );
      }

      const account = store.getAccount('user-1');
      // 5 bookings * 250 = 1250 points, 5 bookings → should be Silver
      expect(account!.tier).toBe(LoyaltyTier.SILVER);
    });

    it('records separate transactions for tier bonus and campaign bonus', () => {
      // Set up an account at Silver tier
      const acct = store.getOrCreateAccount('user-2');
      acct.tier = LoyaltyTier.SILVER;
      acct.totalPoints = 1000;
      acct.lifetimeBookings = 5;
      store.updateAccount(acct);

      campaignManager.createCampaign({
        name: 'Promo',
        type: CampaignType.PROMOTIONAL,
        multiplier: 1.5,
        flatBonus: 10,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      calculator.award(
        makeBooking({ bookingId: 'BK-S1', userId: 'user-2', amount: 100 }),
      );

      const txs = store.getTransactionsByUser('user-2');
      const types = txs.map(t => t.type);

      expect(types).toContain('earned');
      expect(types).toContain('bonus');
    });
  });
});
