import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { RefundService } from '../../services/refundService';
import { RefundAuditService } from '../../services/refundAuditService';
import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import { logger } from '../../utils/logger';
import { requireAdmin } from '../../middleware/adminAuth';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { validateRequest } from '../../middleware/validationMiddleware';
import { refundReconciliationService } from '../../services/refundReconciliationService';

const router = Router();
const refundService = RefundService.getInstance();
const auditService = RefundAuditService.getInstance();

const refundIdParamSchema = z.object({ id: z.string().uuid() });
const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() });
const adminListQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
const reconciliationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  statuses: z.string().optional(),
  dryRun: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === 'string' ? v === 'true' : v)),
});
const operatorActionSchema = z.object({
  action: z.enum(['investigated', 'escalated', 'resolved']),
  notes: z.string().min(5).max(2000),
  nextAction: z.string().max(500).optional(),
});

function validateParams(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: Function) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: parsed.error.issues,
          retryable: false,
          requestId: String(res.locals.requestId || 'unknown'),
          timestamp: new Date().toISOString(),
        },
      });
    }
    req.params = parsed.data as any;
    next();
  };
}

function validateQuery(schema: z.ZodTypeAny) {
  return (req: Request, res: Response, next: Function) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation error',
          code: 'VALIDATION_ERROR',
          details: parsed.error.issues,
          retryable: false,
          requestId: String(res.locals.requestId || 'unknown'),
          timestamp: new Date().toISOString(),
        },
      });
    }
    req.query = parsed.data as any;
    next();
  };
}

const createRefundSchema = z
  .object({
    bookingId: z.string().uuid(),
    reason: z.enum([
      'flight_cancelled',
      'flight_delayed',
      'customer_request',
      'duplicate_booking',
      'service_issue',
      'other',
    ]),
    reasonDetails: z.string().optional(),
    requestedBy: z.string().optional(),
    requestedRefundPercentage: z.number().min(0).max(100).optional(),
    requestedRefundAmountCents: z.number().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requestedRefundPercentage !== undefined && data.requestedRefundAmountCents !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requestedRefundPercentage'],
        message: 'Cannot specify both requestedRefundPercentage and requestedRefundAmountCents',
      });
    }
  });

const manualReviewSchema = z
  .object({
    approved: z.boolean(),
    reviewedBy: z.string().min(1),
    reviewNotes: z.string().min(1),
    customRefundPercentage: z.number().min(0).max(100).optional(),
    adminOverrideJustification: z.string().min(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.customRefundPercentage !== undefined && !data.adminOverrideJustification) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adminOverrideJustification'],
        message: 'Admin override justification is required when custom refund percentage is used',
      });
    }
  });

const submitOnchainSchema = z.object({
  signedXdr: z.string().min(1),
});

const autoEligibleSchema = z.object({
  bookingId: z.string().uuid(),
});

const batchRefundSchema = z.object({
  bookingIds: z.array(z.string().uuid()).min(1).max(100),
});

const disputeSchema = z.object({
  reason: z.string().min(1),
  details: z.string().optional(),
  filedBy: z.string().optional(),
});

const disputeResolutionSchema = z
  .object({
    resolution: z.enum(['approved', 'rejected', 'partial']),
    resolvedBy: z.string().min(1),
    notes: z.string().min(1),
    customRefundPercentage: z.number().min(0).max(100).optional(),
    adminOverrideJustification: z.string().min(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.customRefundPercentage !== undefined && !data.adminOverrideJustification) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adminOverrideJustification'],
        message: 'Admin override justification is required when custom refund percentage is used',
      });
    }
  });

/**
 * POST /api/v1/refunds/request
 */
router.post(
  '/request',
  validateRequest('/api/v1/refunds/request'),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const refund = await refundService.createRefundRequest(parsed.data);
      logger.info(`Refund request created: ${refund.id}`);
      return res.status(201).json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to create refund request', error);
      throw new BadRequestError(error.message || 'Failed to create refund request');
    }
  }),
);

/**
 * POST /api/v1/refunds/auto-eligible
 */
router.post(
  '/auto-eligible',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = autoEligibleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const eligibility = await refundService.checkAutomatedEligibility(parsed.data.bookingId);
      return res.json({ success: true, data: eligibility });
    } catch (error: any) {
      logger.error('Failed to check automated eligibility', error);
      throw new BadRequestError(error.message || 'Failed to check eligibility');
    }
  }),
);

/**
 * POST /api/v1/refunds/partial-calculation
 */
router.post(
  '/partial-calculation',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = autoEligibleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const bookingRepo = AppDataSource.getRepository(Booking);
      const booking = await bookingRepo.findOne({
        where: { id: parsed.data.bookingId },
        relations: ['flight'],
      });
      if (!booking) {
        throw new NotFoundError('Booking not found');
      }
      const partialRefundBreakdown = refundService.calculatePartialRefund(booking);
      return res.json({ success: true, data: partialRefundBreakdown });
    } catch (error: any) {
      logger.error('Failed to calculate partial refund', error);
      throw new BadRequestError(error.message || 'Failed to calculate partial refund');
    }
  }),
);

/**
 * POST /api/v1/refunds/batch (admin only)
 */
router.post(
  '/batch',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = batchRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const result = await refundService.processBatchRefunds(parsed.data.bookingIds);
      return res.status(202).json({ success: true, data: result });
    } catch (error: any) {
      logger.error('Failed to process batch refunds', error);
      throw new BadRequestError(error.message || 'Failed to process batch refunds');
    }
  }),
);

/**
 * GET /api/v1/refunds/stats
 */
router.get(
  '/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      const stats = await refundService.getRefundStats();
      return res.json({ success: true, data: stats });
    } catch (error: any) {
      logger.error('Failed to get refund stats', error);
      throw new BadRequestError(error.message || 'Failed to get refund stats');
    }
  }),
);

/**
 * GET /api/v1/refunds/booking/:bookingId
 */
router.get(
  '/booking/:bookingId',
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refunds = await refundService.getRefundsByBooking(req.params.bookingId);
    return res.json({ success: true, data: refunds });
  }),
);

// Admin collection endpoints (must be before /:id)
router.get(
  '/admin/review-queue',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const refunds = await refundService.getManualReviewQueue();
    return res.json({ success: true, data: refunds, count: refunds.length });
  }),
);

router.get(
  '/admin/all',
  requireAdmin,
  validateQuery(adminListQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as any;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const result = await refundService.getAllRefunds({ status, limit, offset });
    return res.json({ success: true, data: result.refunds, total: result.total, limit, offset });
  }),
);

router.get(
  '/admin/delayed-pending',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const refunds = await refundService.getPendingDelayedRefunds();
    return res.json({ success: true, data: refunds, count: refunds.length });
  }),
);

router.get(
  '/admin/delayed-ready',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const refunds = await refundService.getDelayedRefundsReadyForProcessing();
    return res.json({ success: true, data: refunds, count: refunds.length });
  }),
);

/**
 * GET /api/v1/refunds/admin/reconciliation (admin only)
 * Bounded Stripe/Soroban/internal refund reconciliation with audited findings.
 */
router.get(
  '/admin/reconciliation',
  requireAdmin,
  validateQuery(reconciliationQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const statuses =
      typeof req.query.statuses === 'string' && req.query.statuses.trim().length
        ? req.query.statuses
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    const result = await refundReconciliationService.reconcile({
      limit: req.query.limit ? Number(req.query.limit) : 50,
      statuses,
      dryRun: req.query.dryRun === true,
    });
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/v1/refunds/:id
 */
router.get(
  '/:id',
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refund = await refundService.getRefund(req.params.id);
    if (!refund) {
      throw new NotFoundError('Refund not found');
    }
    return res.json({ success: true, data: refund });
  }),
);

router.get(
  '/:id/status',
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const refund = await refundService.checkOnchainStatus(req.params.id);
      return res.json({
        success: true,
        data: {
          refundStatus: refund.status,
          stripeRefundId: refund.stripeRefundId,
          sorobanTxHash: refund.sorobanTxHash,
          approvedAmount: refund.approvedAmountCents,
        },
      });
    } catch {
      const refund = await refundService.getRefund(req.params.id);
      if (!refund) {
        throw new NotFoundError('Refund not found');
      }
      return res.json({
        success: true,
        data: {
          refundStatus: refund.status,
          stripeRefundId: refund.stripeRefundId,
          sorobanTxHash: refund.sorobanTxHash,
          approvedAmount: refund.approvedAmountCents,
        },
      });
    }
  }),
);

router.get(
  '/:id/audit-trail',
  validateParams(refundIdParamSchema),
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const auditTrail = await auditService.getAuditTrail(req.params.id);
    return res.json({ success: true, data: auditTrail });
  }),
);

router.post(
  '/:id/submit-onchain',
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = submitOnchainSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const refund = await refundService.submitOnchainRefund(req.params.id, parsed.data.signedXdr);
      return res.status(202).json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to submit on-chain refund', error);
      throw new BadRequestError(error.message || 'Failed to submit on-chain refund');
    }
  }),
);

router.post(
  '/:id/review',
  validateParams(refundIdParamSchema),
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = manualReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const refund = await refundService.manualReview(
        req.params.id,
        parsed.data.approved,
        parsed.data.reviewedBy,
        parsed.data.reviewNotes,
        parsed.data.customRefundPercentage,
        parsed.data.adminOverrideJustification,
      );
      logger.info(`Refund ${req.params.id} reviewed by ${parsed.data.reviewedBy}`);
      return res.json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to review refund', error);
      throw new BadRequestError(error.message || 'Failed to review refund');
    }
  }),
);

router.post(
  '/:id/cancel',
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const cancelSchema = z.object({
      cancelledBy: z.string().min(1),
      cancellationReason: z.string().min(1),
    });
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const refund = await refundService.cancelDelayedRefund(
        req.params.id,
        parsed.data.cancelledBy,
        parsed.data.cancellationReason,
      );
      logger.info(`Delayed refund ${req.params.id} cancelled by ${parsed.data.cancelledBy}`);
      return res.json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to cancel delayed refund', error);
      throw new BadRequestError(error.message || 'Failed to cancel delayed refund');
    }
  }),
);

router.post(
  '/:id/process-delayed',
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const refund = await refundService.processDelayedRefund(req.params.id);
      logger.info(`Delayed refund ${req.params.id} processed after timelock expiration`);
      return res.json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to process delayed refund', error);
      throw new BadRequestError(error.message || 'Failed to process delayed refund');
    }
  }),
);

router.post(
  '/:id/emergency-override',
  validateParams(refundIdParamSchema),
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const overrideSchema = z.object({
      overrideBy: z.string().min(1),
      overrideReason: z.string().min(1),
    });
    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const refund = await refundService.emergencyOverrideDelayedRefund(
        req.params.id,
        parsed.data.overrideBy,
        parsed.data.overrideReason,
      );
      logger.warn(`Emergency override applied to refund ${req.params.id} by ${parsed.data.overrideBy}`);
      return res.json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to apply emergency override', error);
      throw new BadRequestError(error.message || 'Failed to apply emergency override');
    }
  }),
);

router.post(
  '/:id/dispute',
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = disputeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      await auditService.logAction({
        refundId: req.params.id,
        action: 'dispute_submitted',
        actor: parsed.data.filedBy,
        metadata: {
          reason: parsed.data.reason,
          details: parsed.data.details,
        },
      });
      logger.info(`Dispute submitted for refund ${req.params.id}`);
      return res.status(201).json({
        success: true,
        data: { refundId: req.params.id, status: 'dispute_filed' },
      });
    } catch (error: any) {
      logger.error('Failed to submit dispute', error);
      throw new BadRequestError(error.message || 'Failed to submit dispute');
    }
  }),
);

router.post(
  '/:id/resolve-dispute',
  validateParams(refundIdParamSchema),
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = disputeResolutionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }
    try {
      const refund = await refundService.handleDisputeResolution(req.params.id, {
        resolution: parsed.data.resolution,
        resolvedBy: parsed.data.resolvedBy,
        notes: parsed.data.notes,
        customRefundPercentage: parsed.data.customRefundPercentage,
        adminOverrideJustification: parsed.data.adminOverrideJustification,
      });
      logger.info(
        `Dispute for refund ${req.params.id} resolved as ${parsed.data.resolution} by ${parsed.data.resolvedBy}`,
      );
      return res.json({ success: true, data: refund });
    } catch (error: any) {
      logger.error('Failed to resolve dispute', error);
      throw new BadRequestError(error.message || 'Failed to resolve dispute');
    }
  }),
);

/**
 * POST /api/v1/refunds/:id/reconciliation-action (admin only)
 * Record audited operator investigation/escalation/resolution for reconciliation findings.
 */
router.post(
  '/:id/reconciliation-action',
  validateParams(refundIdParamSchema),
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = operatorActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    await refundReconciliationService.recordOperatorAction({
      refundId: req.params.id,
      action: parsed.data.action,
      actor: req.admin?.email || req.admin?.adminId || 'admin',
      notes: parsed.data.notes,
      nextAction: parsed.data.nextAction,
    });

    logger.info('Refund reconciliation operator action recorded', {
      refundId: req.params.id,
      action: parsed.data.action,
      actor: req.admin?.email || req.admin?.adminId,
    });

    return res.json({ success: true });
  }),
);

export const refundRoutes = router;
export default router;
