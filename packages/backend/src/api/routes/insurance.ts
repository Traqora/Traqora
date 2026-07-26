import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { InsuranceService } from '../../services/insuranceService';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/errors';

const router = Router();
const insuranceService = InsuranceService.getInstance();

const coverageTypeSchema = z.enum(['basic', 'standard', 'premium']);

const quoteSchema = z.object({
  tripCostCents: z.number().int().positive(),
  destination: z.string().min(3).max(3),
  coverageType: coverageTypeSchema.default('standard'),
});

const purchaseSchema = z.object({
  bookingId: z.string().min(1),
  tripCostCents: z.number().int().positive(),
  destination: z.string().min(3).max(3),
  coverageType: coverageTypeSchema.default('standard'),
});

const claimSchema = z.object({
  eventType: z.enum(['medical', 'baggage', 'trip_cancellation', 'other']),
  description: z.string().min(1),
  amountRequestedCents: z.number().int().positive(),
  contactEmail: z.string().email().optional(),
});

/**
 * POST /api/v1/insurance/quote
 * Calculate premium for a given trip cost, destination, and coverage tier
 */
router.post(
  '/quote',
  // eslint-disable-next-line @typescript-eslint/require-await -- asyncHandler requires a Promise-returning handler
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const quote = insuranceService.calculatePremium(
      parsed.data.tripCostCents,
      parsed.data.destination,
      parsed.data.coverageType,
    );

    return res.json({ success: true, data: quote });
  }),
);

/**
 * GET /api/v1/insurance/quotes?tripCostCents=&destination=
 * Return quotes for all coverage tiers at once, for tier comparison UIs
 */
router.get(
  '/quotes',
  // eslint-disable-next-line @typescript-eslint/require-await -- asyncHandler requires a Promise-returning handler
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({
        tripCostCents: z.coerce.number().int().positive(),
        destination: z.string().min(3).max(3),
      })
      .safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const tiers: Array<'basic' | 'standard' | 'premium'> = ['basic', 'standard', 'premium'];
    const quotes = tiers.map((tier) =>
      insuranceService.calculatePremium(parsed.data.tripCostCents, parsed.data.destination, tier),
    );

    return res.json({ success: true, data: quotes });
  }),
);

/**
 * POST /api/v1/insurance/purchase
 * Purchase a policy for a booking (calls the mock third-party provider)
 */
router.post(
  '/purchase',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    try {
      const policy = await insuranceService.purchasePolicy(parsed.data);
      return res.status(201).json({ success: true, data: policy });
    } catch (error: any) {
      logger.error('Failed to purchase insurance policy', error);
      throw new BadRequestError(error.message || 'Failed to purchase insurance policy');
    }
  }),
);

/**
 * GET /api/v1/insurance/policy/:id
 */
router.get(
  '/policy/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const policy = await insuranceService.getPolicy(req.params.id);
    if (!policy) throw new NotFoundError('Insurance policy not found');
    return res.json({ success: true, data: policy });
  }),
);

/**
 * GET /api/v1/insurance/policy/:id/pdf
 * Streams the policy document as a PDF
 */
router.get(
  '/policy/:id/pdf',
  asyncHandler(async (req: Request, res: Response) => {
    const policy = await insuranceService.getPolicy(req.params.id);
    if (!policy) throw new NotFoundError('Insurance policy not found');

    const pdfBuffer = await insuranceService.generatePolicyPdf(policy);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="policy-${policy.providerPolicyRef}.pdf"`);
    return res.send(pdfBuffer);
  }),
);

/**
 * GET /api/v1/insurance/booking/:bookingId
 * Most recent policy for a booking, used to show insurance status in the itinerary
 */
router.get(
  '/booking/:bookingId',
  asyncHandler(async (req: Request, res: Response) => {
    const policy = await insuranceService.getPolicyByBooking(req.params.bookingId);
    return res.json({ success: true, data: policy });
  }),
);

/**
 * POST /api/v1/insurance/policy/:id/refund
 * Refund the premium if requested within 24 hours of purchase
 */
router.post(
  '/policy/:id/refund',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const policy = await insuranceService.requestRefund(req.params.id);
      return res.json({ success: true, data: policy });
    } catch (error: any) {
      throw new BadRequestError(error.message || 'Failed to refund insurance policy');
    }
  }),
);

/**
 * POST /api/v1/insurance/policy/:id/claims
 * Submit a claim against an active policy
 */
router.post(
  '/policy/:id/claims',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = claimSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    try {
      const claim = await insuranceService.submitClaim({
        policyId: req.params.id,
        ...parsed.data,
      });
      return res.status(201).json({ success: true, data: claim });
    } catch (error: any) {
      throw new BadRequestError(error.message || 'Failed to submit claim');
    }
  }),
);

/**
 * GET /api/v1/insurance/policy/:id/claims
 */
router.get(
  '/policy/:id/claims',
  asyncHandler(async (req: Request, res: Response) => {
    const claims = await insuranceService.getClaimsForPolicy(req.params.id);
    return res.json({ success: true, data: claims });
  }),
);

export const insuranceRoutes = router;
