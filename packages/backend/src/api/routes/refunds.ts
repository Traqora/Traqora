import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { RefundService } from '../../services/refundService';
import { RefundAuditService } from '../../services/refundAuditService';
import { logger } from '../../utils/logger';

const router = Router();
const refundService = RefundService.getInstance();
const auditService = RefundAuditService.getInstance();

// Request refund schema
const createRefundSchema = z.object({
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
});

// Manual review schema
const manualReviewSchema = z.object({
  approved: z.boolean(),
  reviewedBy: z.string().min(1),
  reviewNotes: z.string().min(1),
  customRefundPercentage: z.number().min(0).max(100).optional(),
});

// Submit on-chain refund schema
const submitOnchainSchema = z.object({
  signedXdr: z.string().min(1),
});

import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors';

/**
 * POST /api/v1/refunds/request
 * Create a new refund request
 */
router.post('/request', asyncHandler(async (req: Request, res: Response) => {
  const parsed = createRefundSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError('Validation error', parsed.error.flatten());
  }

  try {
    const refund = await refundService.createRefundRequest(parsed.data);
    logger.info(`Refund request created: ${refund.id}`);

    return res.status(201).json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to create refund request', error);
    throw new BadRequestError(error.message || 'Failed to create refund request');
  }
}));

/**
 * GET /api/v1/refunds/:id
 * Get refund details by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const refund = await refundService.getRefund(req.params.id);

  if (!refund) {
    throw new NotFoundError('Refund not found');
  }

  return res.json({
    success: true,
    data: refund,
  });
}));

/**
 * GET /api/v1/refunds/booking/:bookingId
 * Get all refunds for a specific booking
 */
router.get('/booking/:bookingId', asyncHandler(async (req: Request, res: Response) => {
  const refunds = await refundService.getRefundsByBooking(req.params.bookingId);

  return res.json({
    success: true,
    data: refunds,
  });
}));

/**
 * POST /api/v1/refunds/:id/submit-onchain
 * Submit signed Soroban refund transaction
 */
router.post('/:id/submit-onchain', asyncHandler(async (req: Request, res: Response) => {
  const parsed = submitOnchainSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new BadRequestError('Validation error', parsed.error.flatten());
  }

  try {
    const refund = await refundService.submitOnchainRefund(
      req.params.id,
      parsed.data.signedXdr
    );

    return res.status(202).json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to submit on-chain refund', error);
    throw new BadRequestError(error.message || 'Failed to submit on-chain refund');
  }
}));

/**
 * GET /api/v1/refunds/:id/status
 * Check refund and on-chain transaction status
 */
router.get('/:id/status', asyncHandler(async (req: Request, res: Response) => {
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
  } catch (error: any) {
    // If refund doesn't have on-chain tx, just return current status
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
}));

/**
 * GET /api/v1/refunds/admin/review-queue
 * Get all refunds requiring manual review (admin only)
 */
router.get('/admin/review-queue', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

  const refunds = await refundService.getManualReviewQueue();

  return res.json({
    success: true,
    data: refunds,
    count: refunds.length,
  });
}));

/**
 * GET /api/v1/refunds/admin/all
 * Get all refunds with optional filters (admin only)
 */
router.get('/admin/all', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

  const status = req.query.status as any;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
  const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

  const result = await refundService.getAllRefunds({
    status,
    limit,
    offset,
  });

  return res.json({
    success: true,
    data: result.refunds,
    total: result.total,
    limit,
    offset,
  });
}));

/**
 * POST /api/v1/refunds/:id/review
 * Manually review and approve/reject a refund (admin only)
 */
router.post('/:id/review', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

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
      parsed.data.customRefundPercentage
    );

    logger.info(`Refund ${req.params.id} reviewed by ${parsed.data.reviewedBy}`);

    return res.json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to review refund', error);
    throw new BadRequestError(error.message || 'Failed to review refund');
  }
}));

/**
 * GET /api/v1/refunds/:id/audit-trail
 * Get audit trail for a specific refund (admin only)
 */
router.get('/:id/audit-trail', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

  const auditTrail = await auditService.getAuditTrail(req.params.id);

  return res.json({
    success: true,
    data: auditTrail,
  });
}));

/**
 * POST /api/v1/refunds/:id/cancel
 * Cancel a delayed refund request during the waiting period
 */
router.post('/:id/cancel', asyncHandler(async (req: Request, res: Response) => {
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
      parsed.data.cancellationReason
    );

    logger.info(`Delayed refund ${req.params.id} cancelled by ${parsed.data.cancelledBy}`);

    return res.json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to cancel delayed refund', error);
    throw new BadRequestError(error.message || 'Failed to cancel delayed refund');
  }
}));

/**
 * POST /api/v1/refunds/:id/process-delayed
 * Process a delayed refund after timelock expiration
 */
router.post('/:id/process-delayed', asyncHandler(async (req: Request, res: Response) => {
  try {
    const refund = await refundService.processDelayedRefund(req.params.id);

    logger.info(`Delayed refund ${req.params.id} processed after timelock expiration`);

    return res.json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to process delayed refund', error);
    throw new BadRequestError(error.message || 'Failed to process delayed refund');
  }
}));

/**
 * POST /api/v1/refunds/:id/emergency-override
 * Emergency override to process a delayed refund immediately (admin only)
 */
router.post('/:id/emergency-override', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

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
      parsed.data.overrideReason
    );

    logger.warn(
      `Emergency override applied to refund ${req.params.id} by ${parsed.data.overrideBy}`
    );

    return res.json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to apply emergency override', error);
    throw new BadRequestError(error.message || 'Failed to apply emergency override');
  }
}));

/**
 * GET /api/v1/refunds/admin/delayed-pending
 * Get all pending delayed refunds (admin only)
 */
router.get('/admin/delayed-pending', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

  const refunds = await refundService.getPendingDelayedRefunds();

  return res.json({
    success: true,
    data: refunds,
    count: refunds.length,
  });
}));

/**
 * GET /api/v1/refunds/admin/delayed-ready
 * Get delayed refunds ready for processing (admin only)
 */
router.get('/admin/delayed-ready', asyncHandler(async (req: Request, res: Response) => {
  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    throw new ForbiddenError('Unauthorized');
  }

  const refunds = await refundService.getDelayedRefundsReadyForProcessing();

  return res.json({
    success: true,
    data: refunds,
    count: refunds.length,
  });
}));

export const refundRoutes = router;
