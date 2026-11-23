import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { requireAdmin } from '../../middleware/adminAuth';
import {
  ancillaryService,
  getAncillaryCatalog,
} from '../../services/ancillaryService';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

const detailsSchema = z.record(z.union([z.string(), z.number(), z.boolean()]));
const upgradeClassSchema = z.enum(['premium', 'business', 'first']);

const purchaseSchema = z.object({
  bookingId: z.string().uuid(),
  serviceCode: z.string().trim().min(1).max(48),
  quantity: z.number().int().positive().max(9).default(1),
  details: detailsSchema.optional(),
});

const upgradeBidSchema = z.object({
  bookingId: z.string().uuid(),
  targetClass: upgradeClassSchema,
  bidCents: z.number().int().positive(),
});

const resolveBidSchema = z.object({
  accepted: z.boolean(),
});

const gateUpgradeSchema = z.object({
  bookingId: z.string().uuid(),
  targetClass: upgradeClassSchema,
  seatNumber: z.string().trim().min(1).max(8).optional(),
});

const revenueQuerySchema = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .transform(({ from, to }) => ({
    from: from ? new Date(from) : new Date(0),
    to: to ? new Date(to) : new Date(),
  }));

/**
 * GET /api/v1/ancillary/catalog
 * Return purchasable services for a cabin and optional departure airport.
 */
router.get(
  '/catalog',
  (req: Request, res: Response) => {
    const cabinClass = typeof req.query.cabinClass === 'string' ? req.query.cabinClass : undefined;
    const airport = typeof req.query.airport === 'string' ? req.query.airport : undefined;
    return res.json({ data: getAncillaryCatalog(cabinClass, airport) });
  },
);

/**
 * GET /api/v1/ancillary/availability/:bookingId/:serviceCode
 * Check if a specific ancillary service is currently available for a booking.
 */
router.get(
  '/availability/:bookingId/:serviceCode',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsedBookingId = z.string().uuid().safeParse(req.params.bookingId);
    if (!parsedBookingId.success) {
      return res.status(400).json({ error: parsedBookingId.error.flatten() });
    }
    const serviceCode = String(req.params.serviceCode || '').trim();
    if (!serviceCode) {
      return res.status(400).json({ error: 'Service code is required' });
    }

    const result = await ancillaryService.checkAvailability(
      parsedBookingId.data,
      serviceCode,
      req.user?.walletAddress,
      req.query as Record<string, string | number | boolean>,
    );

    return res.json({ data: result });
  }),
);

/**
 * POST /api/v1/ancillary/purchases
 * Purchase priority boarding, lounge access, extra legroom, or a fixed-price upgrade.
 */
router.post(
  '/purchases',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const purchase = await ancillaryService.purchase(parsed.data, req.user?.walletAddress);
    return res.status(201).json({ data: purchase });
  }),
);

/**
 * POST /api/v1/ancillary/upgrade-bids
 * Place an upgrade bid. Pending bids are excluded from revenue until accepted.
 */
router.post(
  '/upgrade-bids',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = upgradeBidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const bid = await ancillaryService.placeUpgradeBid(parsed.data, req.user?.walletAddress);
    return res.status(201).json({ data: bid });
  }),
);

/**
 * PATCH /api/v1/ancillary/upgrade-bids/:id
 * Accept or reject a pending upgrade bid.
 */
router.patch(
  '/upgrade-bids/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = resolveBidSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const bid = await ancillaryService.resolveUpgradeBid(req.params.id, parsed.data.accepted);
    return res.json({ data: bid });
  }),
);

/**
 * POST /api/v1/ancillary/gate-upgrades
 * Fulfil a last-minute upgrade for an already paid booking.
 */
router.post(
  '/gate-upgrades',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = gateUpgradeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const purchase = await ancillaryService.purchaseGateUpgrade(parsed.data);
    return res.status(201).json({ data: purchase });
  }),
);

/**
 * GET /api/v1/ancillary/recommendations/:bookingId
 * Return cabin-aware add-ons that have not already been purchased.
 */
router.get(
  '/recommendations/:bookingId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z.string().uuid().safeParse(req.params.bookingId);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const recommendations = await ancillaryService.recommendations(
      parsed.data,
      req.user?.walletAddress,
    );
    return res.json({ data: recommendations });
  }),
);

/**
 * GET /api/v1/ancillary/revenue
 * Aggregate recognised ancillary revenue by service type and date range.
 */
router.get(
  '/revenue',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = revenueQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const report = await ancillaryService.revenueReport(parsed.data.from, parsed.data.to);
    return res.json({ data: report });
  }),
);

export default router;
