import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { RefundService } from '../../services/refundService';
import { RefundAuditService } from '../../services/refundAuditService';
import {
  deriveRefundOutcome,
  isBookingFullyRefunded,
  REFUND_OUTCOME_LABELS,
  toTravelerRefund,
} from '../../services/refundPresentation';
import { AppDataSource } from '../../db/dataSource';
import { Booking } from '../../db/entities/Booking';
import { Refund } from '../../db/entities/Refund';
import { logger } from '../../utils/logger';
import { requireAdmin } from '../../middleware/adminAuth';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { validateBody, validateParams, validateQuery } from '../../middleware/requestValidation';
import { requireAuth } from '../../middleware/authMiddleware';
import { refundReconciliationService } from '../../services/refundReconciliationService';

const router = Router();
const refundService = RefundService.getInstance();
const auditService = RefundAuditService.getInstance();

/**
 * Traveler-facing status payload. The derived outcome replaces raw
 * `status === 'completed'` as the signal for "fully refunded" so partial,
 * delayed, failed and unknown results are never reported as complete (#1155).
 */
function refundStatusPayload(refund: Refund) {
  const outcome = deriveRefundOutcome(refund);
  return {
    refundStatus: refund.status,
    outcome,
    outcomeLabel: REFUND_OUTCOME_LABELS[outcome],
    isFullyRefunded: isBookingFullyRefunded(refund),
    stripeRefundId: refund.stripeRefundId,
    sorobanTxHash: refund.sorobanTxHash,
    approvedAmount: refund.approvedAmountCents,
    requestedAmount: refund.requestedAmountCents,
    isDelayed: Boolean(refund.isDelayed),
  };
}

const refundIdParamSchema = z.object({ id: z.string().uuid() }).strict();
const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();

const adminListQuerySchema = z
  .object({
    status: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

const reconciliationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  statuses: z.string().max(256).optional(),
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
    reasonDetails: z.string().max(2000).optional(),
    requestedBy: z.string().max(256).optional(),
    requestedRefundPercentage: z.number().min(0).max(100).optional(),
    requestedRefundAmountCents: z.number().int().min(0).max(1_000_000_000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.requestedRefundPercentage !== undefined &&
      data.requestedRefundAmountCents !== undefined
    ) {
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
    reviewedBy: z.string().min(1).max(256),
    reviewNotes: z.string().min(1).max(2000),
    customRefundPercentage: z.number().min(0).max(100).optional(),
    adminOverrideJustification: z.string().min(10).max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.customRefundPercentage !== undefined && !data.adminOverrideJustification) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adminOverrideJustification'],
        message: 'Admin override justification is required when custom refund percentage is used',
      });
    }
  });

const submitOnchainSchema = z.object({ signedXdr: z.string().min(1).max(200000) }).strict();

const autoEligibleSchema = z.object({ bookingId: z.string().uuid() }).strict();

const batchRefundSchema = z
  .object({ bookingIds: z.array(z.string().uuid()).min(1).max(100) })
  .strict();

const disputeSchema = z
  .object({
    reason: z.string().min(1).max(500),
    details: z.string().max(2000).optional(),
    filedBy: z.string().max(256).optional(),
  })
  .strict();

const disputeResolutionSchema = z
  .object({
    resolution: z.enum(['approved', 'rejected', 'partial']),
    resolvedBy: z.string().min(1).max(256),
    notes: z.string().min(1).max(2000),
    customRefundPercentage: z.number().min(0).max(100).optional(),
    adminOverrideJustification: z.string().min(10).max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.customRefundPercentage !== undefined && !data.adminOverrideJustification) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['adminOverrideJustification'],
        message: 'Admin override justification is required when custom refund percentage is used',
      });
    }
  });

const cancelSchema = z
  .object({
    cancelledBy: z.string().min(1).max(256),
    cancellationReason: z.string().min(1).max(2000),
  })
  .strict();

const processDelayedSchema = z.object({}).strict();

const overrideSchema = z
  .object({
    overrideBy: z.string().min(1).max(256),
    overrideReason: z.string().min(1).max(2000),
  })
  .strict();

async function assertBookingOwnedByRequester(bookingId: string, walletAddress?: string): Promise<Booking> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({
    where: { id: bookingId },
    relations: ['passenger', 'flight'],
  });
  if (!booking) throw new NotFoundError('Booking not found');
  const owner = booking.passenger?.sorobanAddress;
  if (!walletAddress || !owner || owner !== walletAddress) {
    throw new NotFoundError('Booking not found');
  }
  return booking;
}

async function assertRefundOwnedByRequester(refundId: string, walletAddress?: string) {
  const refund = await refundService.getRefund(refundId);
  if (!refund) throw new NotFoundError('Refund not found');
  const owner = (refund as any)?.booking?.passenger?.sorobanAddress;
  if (!walletAddress || !owner || owner !== walletAddress) {
    throw new NotFoundError('Refund not found');
  }
  return refund;
}

router.post(
  '/request',
  requireAuth,
  validateBody(createRefundSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertBookingOwnedByRequester(req.body.bookingId, req.user?.walletAddress);
    const refund = await refundService.createRefundRequest(req.body);
    logger.info(`Refund request created: ${refund.id}`);
    return res.status(201).json({ success: true, data: refund });
  }),
);

router.post(
  '/auto-eligible',
  requireAuth,
  validateBody(autoEligibleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertBookingOwnedByRequester(req.body.bookingId, req.user?.walletAddress);
    const eligibility = await refundService.checkAutomatedEligibility(req.body.bookingId);
    return res.json({ success: true, data: eligibility });
  }),
);

router.post(
  '/partial-calculation',
  requireAuth,
  validateBody(autoEligibleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const booking = await assertBookingOwnedByRequester(req.body.bookingId, req.user?.walletAddress);
    const partialRefundBreakdown = refundService.calculatePartialRefund(booking);
    return res.json({ success: true, data: partialRefundBreakdown });
  }),
);

router.post(
  '/batch',
  requireAdmin,
  validateBody(batchRefundSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await refundService.processBatchRefunds(req.body.bookingIds);
    return res.status(202).json({ success: true, data: result });
  }),
);

router.get(
  '/stats',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await refundService.getRefundStats();
    return res.json({ success: true, data: stats });
  }),
);

router.get(
  '/booking/:bookingId',
  requireAuth,
  validateParams(bookingIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertBookingOwnedByRequester(req.params.bookingId, req.user?.walletAddress);
    const refunds = await refundService.getRefundsByBooking(req.params.bookingId);
    // Traveler-facing history: project each refund so no internal notes leak.
    return res.json({ success: true, data: refunds.map(toTravelerRefund) });
  }),
);

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

router.get(
  '/:id',
  requireAuth,
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refund = await assertRefundOwnedByRequester(req.params.id, req.user?.walletAddress);
    // Traveler-facing: expose the derived outcome but never internal operator
    // notes, reviewer identity, error strings or signing material (#1155/#1156).
    return res.json({ success: true, data: toTravelerRefund(refund) });
  }),
);

router.get(
  '/:id/status',
  requireAuth,
  validateParams(refundIdParamSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertRefundOwnedByRequester(req.params.id, req.user?.walletAddress);
    try {
      const refund = await refundService.checkOnchainStatus(req.params.id);
      return res.json({
        success: true,
        data: refundStatusPayload(refund),
      });
    } catch {
      const refund = await refundService.getRefund(req.params.id);
      if (!refund) throw new NotFoundError('Refund not found');
      return res.json({
        success: true,
        data: refundStatusPayload(refund),
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
  requireAuth,
  validateParams(refundIdParamSchema),
  validateBody(submitOnchainSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertRefundOwnedByRequester(req.params.id, req.user?.walletAddress);
    const refund = await refundService.submitOnchainRefund(req.params.id, req.body.signedXdr);
    return res.status(202).json({ success: true, data: refund });
  }),
);

router.post(
  '/:id/review',
  validateParams(refundIdParamSchema),
  requireAdmin,
  validateBody(manualReviewSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refund = await refundService.manualReview(
      req.params.id,
      req.body.approved,
      req.body.reviewedBy,
      req.body.reviewNotes,
      req.body.customRefundPercentage,
      req.body.adminOverrideJustification,
    );
    logger.info(`Refund ${req.params.id} reviewed by ${req.body.reviewedBy}`);
    return res.json({ success: true, data: refund });
  }),
);

router.post(
  '/:id/cancel',
  requireAuth,
  validateParams(refundIdParamSchema),
  validateBody(cancelSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertRefundOwnedByRequester(req.params.id, req.user?.walletAddress);
    const refund = await refundService.cancelDelayedRefund(
      req.params.id,
      req.body.cancelledBy,
      req.body.cancellationReason,
    );
    logger.info(`Delayed refund ${req.params.id} cancelled by ${req.body.cancelledBy}`);
    return res.json({ success: true, data: refund });
  }),
);

router.post(
  '/:id/process-delayed',
  requireAuth,
  validateParams(refundIdParamSchema),
  validateBody(processDelayedSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertRefundOwnedByRequester(req.params.id, req.user?.walletAddress);
    const refund = await refundService.processDelayedRefund(req.params.id);
    logger.info(`Delayed refund ${req.params.id} processed after timelock expiration`);
    return res.json({ success: true, data: refund });
  }),
);

router.post(
  '/:id/emergency-override',
  validateParams(refundIdParamSchema),
  requireAdmin,
  validateBody(overrideSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refund = await refundService.emergencyOverrideDelayedRefund(
      req.params.id,
      req.body.overrideBy,
      req.body.overrideReason,
    );
    logger.warn(`Emergency override applied to refund ${req.params.id} by ${req.body.overrideBy}`);
    return res.json({ success: true, data: refund });
  }),
);

router.post(
  '/:id/dispute',
  requireAuth,
  validateParams(refundIdParamSchema),
  validateBody(disputeSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await assertRefundOwnedByRequester(req.params.id, req.user?.walletAddress);
    await auditService.logAction({
      refundId: req.params.id,
      action: 'dispute_submitted',
      actor: req.body.filedBy || req.user?.walletAddress,
      metadata: {
        reason: req.body.reason,
        details: req.body.details,
      },
    });
    logger.info(`Dispute submitted for refund ${req.params.id}`);
    return res.status(201).json({
      success: true,
      data: { refundId: req.params.id, status: 'dispute_filed' },
    });
  }),
);

router.post(
  '/:id/resolve-dispute',
  validateParams(refundIdParamSchema),
  requireAdmin,
  validateBody(disputeResolutionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const refund = await refundService.handleDisputeResolution(req.params.id, {
      resolution: req.body.resolution,
      resolvedBy: req.body.resolvedBy,
      notes: req.body.notes,
      customRefundPercentage: req.body.customRefundPercentage,
      adminOverrideJustification: req.body.adminOverrideJustification,
    });
    logger.info(
      `Dispute for refund ${req.params.id} resolved as ${req.body.resolution} by ${req.body.resolvedBy}`,
    );
    return res.json({ success: true, data: refund });
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
  validateBody(operatorActionSchema),
  asyncHandler(async (req: Request, res: Response) => {
    await refundReconciliationService.recordOperatorAction({
      refundId: req.params.id,
      action: req.body.action,
      actor: req.admin?.email || req.admin?.adminId || 'admin',
      notes: req.body.notes,
      nextAction: req.body.nextAction,
    });

    logger.info('Refund reconciliation operator action recorded', {
      refundId: req.params.id,
      action: req.body.action,
      actor: req.admin?.email || req.admin?.adminId,
    });

    return res.json({ success: true });
  }),
);

export const refundRoutes = router;
