import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { CarbonOffsetService } from '../../services/carbonOffsetService';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const router = Router();
const carbonService = CarbonOffsetService.getInstance();

const estimateSchema = z.object({
  flightId: z.string().min(1),
  cabinClass: z.enum(['economy', 'premium_economy', 'business', 'first']).default('economy'),
});

const purchaseSchema = z.object({
  userId: z.string().min(1),
  flightId: z.string().min(1),
  projectId: z.string().min(1),
  amountCents: z.number().int().positive(),
  bookingId: z.string().optional(),
});

const offsetCostSchema = z.object({
  footprintKg: z.number().int().positive(),
  projectId: z.string().min(1),
});

/**
 * GET /api/v1/carbon/projects
 * List available offset projects
 */
router.get(
  '/projects',
  asyncHandler(async (_req: Request, res: Response) => {
    const projects = await carbonService.getOffsetProjects();
    return res.json({ success: true, data: projects });
  }),
);

/**
 * POST /api/v1/carbon/estimate
 * Estimate carbon footprint for a flight
 */
router.post(
  '/estimate',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = estimateSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const footprint = await carbonService.calculateFlightFootprint(
      parsed.data.flightId,
      parsed.data.cabinClass,
    );

    return res.json({ success: true, data: footprint });
  }),
);

/**
 * POST /api/v1/carbon/offset-cost
 * Calculate cost to offset a given footprint with a specific project
 */
router.post(
  '/offset-cost',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = offsetCostSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const cost = await carbonService.calculateOffsetCost(
      parsed.data.footprintKg,
      parsed.data.projectId,
    );

    return res.json({ success: true, data: cost });
  }),
);

/**
 * POST /api/v1/carbon/purchase
 * Purchase carbon offsets for a flight
 */
router.post(
  '/purchase',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    try {
      const certificate = await carbonService.purchaseOffset(parsed.data);
      return res.status(201).json({ success: true, data: certificate });
    } catch (error: any) {
      logger.error('Failed to purchase carbon offset', error);
      throw new BadRequestError(error.message || 'Failed to purchase carbon offset');
    }
  }),
);

/**
 * GET /api/v1/carbon/certificate/:purchaseId
 * Download certificate PDF for an offset purchase
 */
router.get(
  '/certificate/:purchaseId',
  asyncHandler(async (req: Request, res: Response) => {
    const offset = await carbonService.getOffsetPurchase(req.params.purchaseId);
    if (!offset) throw new NotFoundError('Offset purchase not found');

    const pdfBuffer = await carbonService.generateCertificate(req.params.purchaseId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="carbon-certificate-${offset.certificateRef || req.params.purchaseId}.pdf"`);
    return res.send(pdfBuffer);
  }),
);

/**
 * GET /api/v1/carbon/stats?userId=
 * User sustainability stats
 */
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({ userId: z.string().min(1) })
      .safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const stats = await carbonService.getUserSustainabilityStats(parsed.data.userId);
    return res.json({ success: true, data: stats });
  }),
);

export const carbonRoutes = router;
