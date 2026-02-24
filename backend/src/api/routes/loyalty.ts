import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { createLoyaltyServices } from '../../services/loyalty';
import { LoyaltyQueue } from '../../jobs/loyaltyQueue';
import {
  PointsTransactionType,
  CampaignType,
  LoyaltyTier,
} from '../../types/loyalty';
import { logger } from '../../utils/logger';

const router = Router();

// Wire up services
const {
  store,
  campaignManager,
  tierManager,
  pointsCalculator,
  expirationHandler,
  retroactiveCalculator,
  contractSync,
} = createLoyaltyServices();

// Async job queue
const queue = new LoyaltyQueue();

queue.registerHandler('sync_contract', async (data) => {
  const { userId, stellarAddress } = data as { userId: string; stellarAddress: string };
  await contractSync.reconcile(userId, stellarAddress);
});

queue.registerHandler('expire_all', async () => {
  expirationHandler.processAllExpirations();
});

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Account & points endpoints
// ---------------------------------------------------------------------------

router.get(
  '/account/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const account = store.getAccount(userId);

    if (!account) {
      res.status(404).json({
        error: { message: 'Account not found', code: 'ACCOUNT_NOT_FOUND' },
      });
      return;
    }

    const nextTier = tierManager.getNextTier(account.tier);
    const progress = tierManager.getTierProgress(account);

    res.json({ data: { ...account, nextTier, progress } });
  }),
);

router.get(
  '/points/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const account = store.getOrCreateAccount(userId);

    res.json({
      data: {
        userId: account.userId,
        totalPoints: account.totalPoints,
        availablePoints: account.availablePoints,
        tier: account.tier,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Points history (paginated, filterable)
// ---------------------------------------------------------------------------

router.get(
  '/history/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const query = historyQuerySchema.parse(req.query);

    const result = store.getTransactions({
      userId,
      page: query.page,
      limit: query.limit,
      type: query.type,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });

    res.json({ data: result });
  }),
);

// ---------------------------------------------------------------------------
// Points calculation (preview) & awarding
// ---------------------------------------------------------------------------

router.post(
  '/calculate',
  asyncHandler(async (req: Request, res: Response) => {
    const body = awardPointsSchema.parse(req.body);
    const account = store.getOrCreateAccount(body.userId);

    const result = pointsCalculator.preview(
      {
        bookingId: body.bookingId,
        userId: body.userId,
        amount: body.amount,
        completedAt: new Date(body.completedAt),
        route: body.route,
      },
      account.tier,
    );

    res.json({ data: result });
  }),
);

router.post(
  '/award',
  asyncHandler(async (req: Request, res: Response) => {
    const body = awardPointsSchema.parse(req.body);

    const result = pointsCalculator.award({
      bookingId: body.bookingId,
      userId: body.userId,
      amount: body.amount,
      completedAt: new Date(body.completedAt),
      route: body.route,
    });

    res.status(201).json({ data: result });
  }),
);

// ---------------------------------------------------------------------------
// Redeem points
// ---------------------------------------------------------------------------

router.post(
  '/redeem',
  asyncHandler(async (req: Request, res: Response) => {
    const body = redeemPointsSchema.parse(req.body);
    const account = store.getAccount(body.userId);

    if (!account) {
      res.status(404).json({
        error: { message: 'Account not found', code: 'ACCOUNT_NOT_FOUND' },
      });
      return;
    }

    if (account.availablePoints < body.points) {
      res.status(400).json({
        error: { message: 'Insufficient points', code: 'INSUFFICIENT_POINTS' },
      });
      return;
    }

    store.appendTransaction({
      userId: body.userId,
      points: -body.points,
      type: PointsTransactionType.REDEEMED,
      description: `Redeemed ${body.points} points`,
    });

    account.totalPoints -= body.points;
    account.availablePoints -= body.points;
    store.updateAccount(account);

    tierManager.evaluateTier(body.userId);

    const discountDollars = body.points / 100;

    res.json({
      data: {
        pointsRedeemed: body.points,
        discountDollars,
        remainingPoints: account.availablePoints,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Tier info
// ---------------------------------------------------------------------------

router.get(
  '/tier/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const account = store.getAccount(userId);

    if (!account) {
      res.status(404).json({
        error: { message: 'Account not found', code: 'ACCOUNT_NOT_FOUND' },
      });
      return;
    }

    const progress = tierManager.getTierProgress(account);
    const nextTier = tierManager.getNextTier(account.tier);

    res.json({ data: { tier: account.tier, progress, nextTier } });
  }),
);

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

router.get(
  '/campaigns',
  asyncHandler(async (_req: Request, res: Response) => {
    const campaigns = campaignManager.getActiveCampaigns();
    res.json({ data: campaigns });
  }),
);

router.post(
  '/campaigns',
  asyncHandler(async (req: Request, res: Response) => {
    const body = createCampaignSchema.parse(req.body);

    const campaign = campaignManager.createCampaign({
      name: body.name,
      type: body.type,
      multiplier: body.multiplier,
      flatBonus: body.flatBonus,
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      conditions: body.conditions,
    });

    res.status(201).json({ data: campaign });
  }),
);

router.put(
  '/campaigns/:id/deactivate',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
      campaignManager.deactivateCampaign(id);
      res.json({ data: { deactivated: true } });
    } catch (err) {
      res.status(404).json({
        error: {
          message: err instanceof Error ? err.message : 'Campaign not found',
          code: 'CAMPAIGN_NOT_FOUND',
        },
      });
    }
  }),
);

// ---------------------------------------------------------------------------
// Retroactive points calculation
// ---------------------------------------------------------------------------

router.post(
  '/retroactive/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const body = retroactiveSchema.parse(req.body);

    const bookings = body.bookings.map(b => ({
      ...b,
      completedAt: new Date(b.completedAt),
    }));

    const result = retroactiveCalculator.processRetroactive(userId, bookings);

    res.json({ data: result });
  }),
);

// ---------------------------------------------------------------------------
// Points expiration
// ---------------------------------------------------------------------------

router.get(
  '/expiring/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const daysAhead = Number(req.query.days) || 30;
    const beforeDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const result = expirationHandler.getUpcomingExpirations(userId, beforeDate);
    res.json({ data: { ...result, expiresBeforeDate: beforeDate.toISOString() } });
  }),
);

router.post(
  '/expire',
  asyncHandler(async (_req: Request, res: Response) => {
    const results = expirationHandler.processAllExpirations();

    logger.info({ msg: 'Bulk expiration processed', affected: results.length });

    res.json({
      data: {
        accountsAffected: results.length,
        totalPointsExpired: results.reduce((s, r) => s + r.expiredPoints, 0),
        results,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Contract sync
// ---------------------------------------------------------------------------

router.post(
  '/sync/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const body = syncSchema.parse(req.body);

    const result = await contractSync.reconcile(userId, body.stellarAddress);

    if (!result.synced && result.error) {
      res.status(502).json({
        error: { message: result.error, code: 'SYNC_FAILED' },
        data: result,
      });
      return;
    }

    res.json({ data: result });
  }),
);

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

router.get(
  '/reconcile/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { userId } = req.params;
    const result = retroactiveCalculator.reconcileBalance(userId);
    res.json({ data: result });
  }),
);

export { router as loyaltyRoutes };
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

router.get('/balance/:address', asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { address: req.params.address, balance: 0 } });
}));

export const loyaltyRoutes = router;
