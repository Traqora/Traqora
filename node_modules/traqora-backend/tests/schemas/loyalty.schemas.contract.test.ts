// @ts-ignore
import { z } from 'zod';
import {
  PointsTransactionType,
  CampaignType,
  LoyaltyTier,
} from '../../src/types/loyalty';

// Schemas from routes/loyalty.ts
const awardPointsSchema = z.object({
  bookingId: z.string().min(1).max(200),
  userId: z.string().min(1).max(200),
  amount: z.number().positive(),
  completedAt: z.string().datetime(),
  route: z.string().max(100).optional(),
});

const redeemPointsSchema = z.object({
  userId: z.string().min(1).max(200),
  points: z.number().int().positive(),
});

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.nativeEnum(CampaignType),
  multiplier: z.number().min(0).max(100),
  flatBonus: z.number().int().min(0),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  conditions: z
    .object({
      minBookingAmount: z.number().positive().optional(),
      applicableTiers: z.array(z.nativeEnum(LoyaltyTier)).optional(),
      maxUsesPerUser: z.number().int().positive().optional(),
      applicableRoutes: z.array(z.string()).optional(),
    })
    .optional(),
});

const retroactiveSchema = z.object({
  bookings: z.array(
    z.object({
      bookingId: z.string().min(1),
      userId: z.string().min(1),
      amount: z.number().positive(),
      completedAt: z.string().datetime(),
      route: z.string().optional(),
    }),
  ),
});

const syncSchema = z.object({
  stellarAddress: z.string().min(1).max(56),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: z.nativeEnum(PointsTransactionType).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

describe('Loyalty Schema Contract Tests', () => {
  describe('awardPointsSchema', () => {
    const validAward = {
      bookingId: 'booking-123',
      userId: 'user-456',
      amount: 100.5,
      completedAt: '2024-01-01T00:00:00Z',
      route: 'JFK-LAX',
    };

    it('should accept valid award points payload', () => {
      const result = awardPointsSchema.safeParse(validAward);
      expect(result.success).toBe(true);
    });

    it('should accept award without optional route', () => {
      const { route, ...withoutRoute } = validAward;
      const result = awardPointsSchema.safeParse(withoutRoute);
      expect(result.success).toBe(true);
    });

    it('should reject bookingId shorter than 1 character', () => {
      const result = awardPointsSchema.safeParse({ ...validAward, bookingId: '' });
      expect(result.success).toBe(false);
    });

    it('should reject bookingId longer than 200 characters', () => {
      const result = awardPointsSchema.safeParse({
        ...validAward,
        bookingId: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should reject userId shorter than 1 character', () => {
      const result = awardPointsSchema.safeParse({ ...validAward, userId: '' });
      expect(result.success).toBe(false);
    });

    it('should reject amount <= 0', () => {
      const result = awardPointsSchema.safeParse({ ...validAward, amount: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = awardPointsSchema.safeParse({ ...validAward, amount: -10 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime format', () => {
      const result = awardPointsSchema.safeParse({
        ...validAward,
        completedAt: '2024-01-01',
      });
      expect(result.success).toBe(false);
    });

    it('should reject route longer than 100 characters', () => {
      const result = awardPointsSchema.safeParse({
        ...validAward,
        route: 'a'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid ISO datetime', () => {
      const result = awardPointsSchema.safeParse({
        ...validAward,
        completedAt: '2024-12-25T15:30:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('redeemPointsSchema', () => {
    const validRedeem = {
      userId: 'user-456',
      points: 100,
    };

    it('should accept valid redeem points payload', () => {
      const result = redeemPointsSchema.safeParse(validRedeem);
      expect(result.success).toBe(true);
    });

    it('should reject userId shorter than 1 character', () => {
      const result = redeemPointsSchema.safeParse({ ...validRedeem, userId: '' });
      expect(result.success).toBe(false);
    });

    it('should reject points <= 0', () => {
      const result = redeemPointsSchema.safeParse({ ...validRedeem, points: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer points', () => {
      const result = redeemPointsSchema.safeParse({ ...validRedeem, points: 100.5 });
      expect(result.success).toBe(false);
    });

    it('should reject negative points', () => {
      const result = redeemPointsSchema.safeParse({ ...validRedeem, points: -100 });
      expect(result.success).toBe(false);
    });

    it('should accept positive integer points', () => {
      const result = redeemPointsSchema.safeParse({ ...validRedeem, points: 500 });
      expect(result.success).toBe(true);
    });
  });

  describe('createCampaignSchema', () => {
    const validCampaign = {
      name: 'Summer Sale',
      type: CampaignType.MULTIPLIER,
      multiplier: 2.5,
      flatBonus: 100,
      startDate: '2024-06-01T00:00:00Z',
      endDate: '2024-08-31T23:59:59Z',
      conditions: {
        minBookingAmount: 100,
        applicableTiers: [LoyaltyTier.GOLD, LoyaltyTier.PLATINUM],
        maxUsesPerUser: 5,
        applicableRoutes: ['JFK-LAX', 'SFO-NYC'],
      },
    };

    it('should accept valid campaign with all fields', () => {
      const result = createCampaignSchema.safeParse(validCampaign);
      expect(result.success).toBe(true);
    });

    it('should accept campaign without optional conditions', () => {
      const { conditions, ...withoutConditions } = validCampaign;
      const result = createCampaignSchema.safeParse(withoutConditions);
      expect(result.success).toBe(true);
    });

    it('should accept all CampaignType enum values', () => {
      Object.values(CampaignType).forEach((type) => {
        const result = createCampaignSchema.safeParse({
          ...validCampaign,
          type,
        });
        expect(result.success).toBe(true);
      });
    });

    it('should reject multiplier below 0', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        multiplier: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject multiplier above 100', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        multiplier: 101,
      });
      expect(result.success).toBe(false);
    });

    it('should accept multiplier of 0', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        multiplier: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should accept multiplier of 100', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        multiplier: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative flatBonus', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        flatBonus: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should accept flatBonus of 0', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        flatBonus: 0,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name longer than 200 characters', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        name: 'a'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid startDate format', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        startDate: '2024-06-01',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid endDate format', () => {
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        endDate: '2024-08-31',
      });
      expect(result.success).toBe(false);
    });

    it('should accept conditions with partial fields', () => {
      const partialConditions = {
        ...validCampaign,
        conditions: {
          minBookingAmount: 50,
        },
      };
      const result = createCampaignSchema.safeParse(partialConditions);
      expect(result.success).toBe(true);
    });

    it('should accept all LoyaltyTier values in applicableTiers', () => {
      const allTiers = Object.values(LoyaltyTier);
      const result = createCampaignSchema.safeParse({
        ...validCampaign,
        conditions: {
          ...validCampaign.conditions,
          applicableTiers: allTiers,
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('retroactiveSchema', () => {
    const validRetroactive = {
      bookings: [
        {
          bookingId: 'booking-1',
          userId: 'user-1',
          amount: 100,
          completedAt: '2024-01-01T00:00:00Z',
          route: 'JFK-LAX',
        },
        {
          bookingId: 'booking-2',
          userId: 'user-2',
          amount: 200,
          completedAt: '2024-01-02T00:00:00Z',
        },
      ],
    };

    it('should accept valid retroactive payload', () => {
      const result = retroactiveSchema.safeParse(validRetroactive);
      expect(result.success).toBe(true);
    });

    it('should accept single booking in array', () => {
      const result = retroactiveSchema.safeParse({
        bookings: [validRetroactive.bookings[0]],
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty bookings array', () => {
      const result = retroactiveSchema.safeParse({ bookings: [] });
      expect(result.success).toBe(true);
    });

    it('should reject missing bookings field', () => {
      const result = retroactiveSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject non-array bookings', () => {
      const result = retroactiveSchema.safeParse({ bookings: 'not-an-array' });
      expect(result.success).toBe(false);
    });

    it('should reject booking with empty bookingId', () => {
      const result = retroactiveSchema.safeParse({
        bookings: [{ ...validRetroactive.bookings[0], bookingId: '' }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject booking with amount <= 0', () => {
      const result = retroactiveSchema.safeParse({
        bookings: [{ ...validRetroactive.bookings[0], amount: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('should reject booking with invalid datetime', () => {
      const result = retroactiveSchema.safeParse({
        bookings: [{ ...validRetroactive.bookings[0], completedAt: 'invalid' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('syncSchema', () => {
    const validSync = {
      stellarAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZA',
    };

    it('should accept valid Stellar address', () => {
      const result = syncSchema.safeParse(validSync);
      expect(result.success).toBe(true);
    });

    it('should reject empty stellarAddress', () => {
      const result = syncSchema.safeParse({ stellarAddress: '' });
      expect(result.success).toBe(false);
    });

    it('should reject stellarAddress longer than 56 characters', () => {
      const result = syncSchema.safeParse({
        stellarAddress: 'a'.repeat(57),
      });
      expect(result.success).toBe(false);
    });

    it('should accept stellarAddress of exactly 56 characters', () => {
      const result = syncSchema.safeParse({
        stellarAddress: 'a'.repeat(56),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('historyQuerySchema', () => {
    const validQuery = {
      page: 1,
      limit: 20,
      type: PointsTransactionType.EARNED,
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
    };

    it('should accept valid history query with all fields', () => {
      const result = historyQuerySchema.safeParse(validQuery);
      expect(result.success).toBe(true);
    });

    it('should apply default page to 1', () => {
      const result = historyQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
      }
    });

    it('should apply default limit to 20', () => {
      const result = historyQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(20);
      }
    });

    it('should accept page as string (coerced to number)', () => {
      const result = historyQuerySchema.safeParse({ page: '2' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.page).toBe('number');
      }
    });

    it('should accept limit as string (coerced to number)', () => {
      const result = historyQuerySchema.safeParse({ limit: '50' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.limit).toBe('number');
      }
    });

    it('should reject page <= 0', () => {
      const result = historyQuerySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit <= 0', () => {
      const result = historyQuerySchema.safeParse({ limit: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit above 100', () => {
      const result = historyQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should accept all PointsTransactionType values', () => {
      Object.values(PointsTransactionType).forEach((type) => {
        const result = historyQuerySchema.safeParse({ type });
        expect(result.success).toBe(true);
      });
    });

    it('should accept valid ISO datetime for startDate', () => {
      const result = historyQuerySchema.safeParse({
        startDate: '2024-01-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid ISO datetime for endDate', () => {
      const result = historyQuerySchema.safeParse({
        endDate: '2024-12-31T23:59:59Z',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid datetime format for startDate', () => {
      const result = historyQuerySchema.safeParse({
        startDate: '2024-01-01',
      });
      expect(result.success).toBe(false);
    });
  });
});
