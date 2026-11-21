import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { PriceTrackingService } from '../../services/priceTracking';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

const router = Router();
const trackingService = PriceTrackingService.getInstance();

const cabinClassSchema = z.enum([
  'economy',
  'premium_economy',
  'business',
  'first',
]);

const createTrackerSchema = z.object({
  origin: z.string().length(3),
  destination: z.string().length(3),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  cabinClass: cabinClassSchema.default('economy'),
  passengers: z.number().int().min(1).max(9).default(1),
  targetPriceCents: z.number().int().positive().nullish(),
  currency: z.string().length(3).default('USD'),
});

const updateTrackerSchema = z.object({
  targetPriceCents: z.number().int().positive().nullish(),
  status: z.enum(['active', 'paused', 'expired']).optional(),
  cabinClass: cabinClassSchema.optional(),
  passengers: z.number().int().min(1).max(9).optional(),
});

const observationSchema = z.object({
  priceCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  source: z.string().min(1).max(255),
  sourceUrl: z.string().url().nullish(),
  carrierCode: z.string().max(128).nullish(),
  metadata: z.record(z.unknown()).nullish(),
});

const bulkObservationSchema = z.object({
  observations: z
    .array(observationSchema.extend({ trackedFlightId: z.string().uuid() }))
    .min(1)
    .max(100),
});

const historyQuerySchema = z.object({
  days: z.coerce.number().int().positive().max(365).optional(),
  source: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

function requireUserId(req: Request): string {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return String(userId);
}

/**
 * POST /api/v1/tracking/trackers
 * Start tracking a route across third-party sites.
 */
router.post(
  '/trackers',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = createTrackerSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const tracker = await trackingService.createTracker({ ...parsed.data, userId });
    return res.status(201).json({ success: true, data: tracker });
  }),
);

/**
 * GET /api/v1/tracking/trackers?status=
 */
router.get(
  '/trackers',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = z
      .object({ status: z.enum(['active', 'paused', 'expired']).optional() })
      .safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const trackers = await trackingService.listTrackers(userId, parsed.data.status);
    return res.json({ success: true, data: trackers });
  }),
);

/**
 * GET /api/v1/tracking/trackers/:id
 */
router.get(
  '/trackers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const tracker = await trackingService.getTracker(req.params.id, userId);
    return res.json({ success: true, data: tracker });
  }),
);

/**
 * PATCH /api/v1/tracking/trackers/:id
 */
router.patch(
  '/trackers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = updateTrackerSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const tracker = await trackingService.updateTracker(
      req.params.id,
      userId,
      parsed.data,
    );
    return res.json({ success: true, data: tracker });
  }),
);

/**
 * DELETE /api/v1/tracking/trackers/:id
 */
router.delete(
  '/trackers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    await trackingService.deleteTracker(req.params.id, userId);
    return res.status(204).send();
  }),
);

/**
 * POST /api/v1/tracking/trackers/:id/observations
 * Report a single price sighting scraped by the extension.
 */
router.post(
  '/trackers/:id/observations',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = observationSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    // Ownership check before accepting third-party data into the history.
    await trackingService.getTracker(req.params.id, userId);

    const result = await trackingService.recordObservation({
      ...parsed.data,
      trackedFlightId: req.params.id,
    });

    return res.status(201).json({
      success: true,
      data: {
        observation: result.observation,
        priceDrop: result.assessment,
        notified: result.notified,
      },
    });
  }),
);

/**
 * POST /api/v1/tracking/observations
 * Batch endpoint — the extension flushes sightings collected while browsing.
 */
router.post(
  '/observations',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = bulkObservationSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const owned = await trackingService.listTrackers(userId);
    const ownedIds = new Set(owned.map((t) => t.id));
    const permitted = parsed.data.observations.filter((o) =>
      ownedIds.has(o.trackedFlightId),
    );
    const rejected = parsed.data.observations.length - permitted.length;

    const result = await trackingService.recordObservations(permitted);

    return res.status(201).json({
      success: true,
      data: { ...result, rejected },
    });
  }),
);

/**
 * GET /api/v1/tracking/trackers/:id/history?days=&source=&limit=
 */
router.get(
  '/trackers/:id/history',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    await trackingService.getTracker(req.params.id, userId);
    const history = await trackingService.getPriceHistory(req.params.id, parsed.data);
    return res.json({ success: true, data: history });
  }),
);

/**
 * GET /api/v1/tracking/trackers/:id/stats
 */
router.get(
  '/trackers/:id/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    await trackingService.getTracker(req.params.id, userId);
    const stats = await trackingService.getPriceStats(req.params.id);
    return res.json({ success: true, data: stats });
  }),
);

export const trackingRoutes = router;
