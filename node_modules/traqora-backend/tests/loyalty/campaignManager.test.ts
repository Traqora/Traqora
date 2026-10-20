import { LoyaltyStore } from '../../src/services/loyalty/store';
import { CampaignManager } from '../../src/services/loyalty/campaignManager';
import {
  CampaignType,
  LoyaltyTier,
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

describe('CampaignManager', () => {
  let store: LoyaltyStore;
  let manager: CampaignManager;

  beforeEach(() => {
    LoyaltyStore.resetForTesting();
    store = LoyaltyStore.getInstance();
    manager = new CampaignManager(store);
  });

  function makeBooking(overrides: Partial<BookingForPoints> = {}): BookingForPoints {
    return {
      bookingId: 'BK-100',
      userId: 'user-1',
      amount: 500,
      completedAt: new Date('2025-07-15T10:00:00Z'),
      ...overrides,
    };
  }

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------

  describe('createCampaign', () => {
    it('creates a campaign and returns it with an ID', () => {
      const campaign = manager.createCampaign({
        name: 'Summer Promo',
        type: CampaignType.SEASONAL,
        multiplier: 2,
        flatBonus: 100,
        startDate: new Date('2025-06-01'),
        endDate: new Date('2025-08-31'),
      });

      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBe('Summer Promo');
      expect(campaign.active).toBe(true);
      expect(campaign.multiplier).toBe(2);
      expect(campaign.flatBonus).toBe(100);
    });

    it('trims campaign name whitespace', () => {
      const campaign = manager.createCampaign({
        name: '  Holiday Special  ',
        type: CampaignType.PROMOTIONAL,
        multiplier: 1.5,
        flatBonus: 0,
        startDate: new Date('2025-12-01'),
        endDate: new Date('2025-12-31'),
      });

      expect(campaign.name).toBe('Holiday Special');
    });

    it('throws when multiplier is negative', () => {
      expect(() =>
        manager.createCampaign({
          name: 'Bad',
          type: CampaignType.SEASONAL,
          multiplier: -1,
          flatBonus: 0,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-31'),
        }),
      ).toThrow('Campaign multiplier cannot be negative');
    });

    it('throws when flat bonus is negative', () => {
      expect(() =>
        manager.createCampaign({
          name: 'Bad',
          type: CampaignType.SEASONAL,
          multiplier: 1,
          flatBonus: -50,
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-01-31'),
        }),
      ).toThrow('Campaign flat bonus cannot be negative');
    });

    it('throws when end date is before start date', () => {
      expect(() =>
        manager.createCampaign({
          name: 'Backwards',
          type: CampaignType.SEASONAL,
          multiplier: 1,
          flatBonus: 0,
          startDate: new Date('2025-06-30'),
          endDate: new Date('2025-06-01'),
        }),
      ).toThrow('Campaign end date must be after start date');
    });
  });

  // -------------------------------------------------------------------------
  // deactivateCampaign
  // -------------------------------------------------------------------------

  describe('deactivateCampaign', () => {
    it('deactivates an active campaign', () => {
      const campaign = manager.createCampaign({
        name: 'Short Promo',
        type: CampaignType.PROMOTIONAL,
        multiplier: 1.5,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      manager.deactivateCampaign(campaign.id);

      const active = manager.getActiveCampaigns(new Date('2025-06-15'));
      expect(active).toHaveLength(0);
    });

    it('throws when campaign does not exist', () => {
      expect(() => manager.deactivateCampaign('nonexistent')).toThrow(
        'Campaign not found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // getActiveCampaigns
  // -------------------------------------------------------------------------

  describe('getActiveCampaigns', () => {
    it('returns only campaigns active at the given date', () => {
      manager.createCampaign({
        name: 'Jan',
        type: CampaignType.SEASONAL,
        multiplier: 1.5,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-01-31'),
      });
      manager.createCampaign({
        name: 'Jul',
        type: CampaignType.SEASONAL,
        multiplier: 2,
        flatBonus: 50,
        startDate: new Date('2025-07-01'),
        endDate: new Date('2025-07-31'),
      });

      const janCampaigns = manager.getActiveCampaigns(new Date('2025-01-15'));
      expect(janCampaigns).toHaveLength(1);
      expect(janCampaigns[0].name).toBe('Jan');

      const julCampaigns = manager.getActiveCampaigns(new Date('2025-07-15'));
      expect(julCampaigns).toHaveLength(1);
      expect(julCampaigns[0].name).toBe('Jul');

      const novCampaigns = manager.getActiveCampaigns(new Date('2025-11-15'));
      expect(novCampaigns).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getApplicableCampaigns
  // -------------------------------------------------------------------------

  describe('getApplicableCampaigns', () => {
    it('filters by minimum booking amount', () => {
      manager.createCampaign({
        name: 'High Roller',
        type: CampaignType.PROMOTIONAL,
        multiplier: 3,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        conditions: { minBookingAmount: 1000 },
      });

      const small = manager.getApplicableCampaigns(
        makeBooking({ amount: 200 }),
        LoyaltyTier.BRONZE,
        new Date('2025-06-15'),
      );
      expect(small).toHaveLength(0);

      const big = manager.getApplicableCampaigns(
        makeBooking({ amount: 1500 }),
        LoyaltyTier.BRONZE,
        new Date('2025-06-15'),
      );
      expect(big).toHaveLength(1);
    });

    it('filters by applicable tiers', () => {
      manager.createCampaign({
        name: 'Gold Only',
        type: CampaignType.PROMOTIONAL,
        multiplier: 2,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        conditions: { applicableTiers: [LoyaltyTier.GOLD, LoyaltyTier.PLATINUM] },
      });

      const bronze = manager.getApplicableCampaigns(
        makeBooking(),
        LoyaltyTier.BRONZE,
        new Date('2025-06-15'),
      );
      expect(bronze).toHaveLength(0);

      const gold = manager.getApplicableCampaigns(
        makeBooking(),
        LoyaltyTier.GOLD,
        new Date('2025-06-15'),
      );
      expect(gold).toHaveLength(1);
    });

    it('filters by applicable routes', () => {
      manager.createCampaign({
        name: 'NYC Special',
        type: CampaignType.SEASONAL,
        multiplier: 1.5,
        flatBonus: 25,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
        conditions: { applicableRoutes: ['JFK-LAX', 'JFK-SFO'] },
      });

      const matching = manager.getApplicableCampaigns(
        makeBooking({ route: 'JFK-LAX' }),
        LoyaltyTier.BRONZE,
        new Date('2025-06-15'),
      );
      expect(matching).toHaveLength(1);

      const nonMatching = manager.getApplicableCampaigns(
        makeBooking({ route: 'ORD-MIA' }),
        LoyaltyTier.BRONZE,
        new Date('2025-06-15'),
      );
      expect(nonMatching).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // calculateCampaignBonus
  // -------------------------------------------------------------------------

  describe('calculateCampaignBonus', () => {
    it('calculates multiplier bonus correctly', () => {
      const campaign = manager.createCampaign({
        name: 'Double Points',
        type: CampaignType.PROMOTIONAL,
        multiplier: 2,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      // 2x multiplier → extra 1x = 100 bonus on 100 base
      expect(manager.calculateCampaignBonus(100, campaign)).toBe(100);
    });

    it('calculates flat bonus correctly', () => {
      const campaign = manager.createCampaign({
        name: 'Flat 50',
        type: CampaignType.SEASONAL,
        multiplier: 1,
        flatBonus: 50,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      expect(manager.calculateCampaignBonus(100, campaign)).toBe(50);
    });

    it('combines multiplier and flat bonus', () => {
      const campaign = manager.createCampaign({
        name: 'Combo',
        type: CampaignType.PROMOTIONAL,
        multiplier: 1.5,
        flatBonus: 25,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      // floor(200 * 0.5) + 25 = 125
      expect(manager.calculateCampaignBonus(200, campaign)).toBe(125);
    });

    it('returns zero when multiplier is 1x and flat bonus is 0', () => {
      const campaign = manager.createCampaign({
        name: 'No Bonus',
        type: CampaignType.SEASONAL,
        multiplier: 1,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      expect(manager.calculateCampaignBonus(500, campaign)).toBe(0);
    });

    it('floors fractional multiplier results', () => {
      const campaign = manager.createCampaign({
        name: 'Fractional',
        type: CampaignType.PROMOTIONAL,
        multiplier: 1.3,
        flatBonus: 0,
        startDate: new Date('2025-01-01'),
        endDate: new Date('2025-12-31'),
      });

      // floor(33 * 0.3) = floor(9.9) = 9
      expect(manager.calculateCampaignBonus(33, campaign)).toBe(9);
    });
  });
});
