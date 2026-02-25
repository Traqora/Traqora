import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { initDataSource } from '../../db/dataSource';
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

/**
 * POST /api/v1/refunds/request
 * Create a new refund request
 */
router.post('/request', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  const parsed = createRefundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
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
    return res.status(400).json({
      success: false,
      error: {
        message: error.message || 'Failed to create refund request',
        code: 'REFUND_REQUEST_FAILED',
      },
    });
  }
}));

/**
 * GET /api/v1/refunds/:id
 * Get refund details by ID
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  const refund = await refundService.getRefund(req.params.id);

  if (!refund) {
    return res.status(404).json({
      success: false,
      error: {
        message: 'Refund not found',
        code: 'REFUND_NOT_FOUND',
      },
    });
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
  await initDataSource();

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
  await initDataSource();

  const parsed = submitOnchainSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
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
    return res.status(400).json({
      success: false,
      error: {
        message: error.message || 'Failed to submit on-chain refund',
        code: 'ONCHAIN_SUBMIT_FAILED',
      },
    });
  }
}));

/**
 * GET /api/v1/refunds/:id/status
 * Check refund and on-chain transaction status
 */
router.get('/:id/status', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

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
      return res.status(404).json({
        success: false,
        error: {
          message: 'Refund not found',
          code: 'REFUND_NOT_FOUND',
        },
      });
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
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
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
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
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
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
  }

  const parsed = manualReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
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
    return res.status(400).json({
      success: false,
      error: {
        message: error.message || 'Failed to review refund',
        code: 'REVIEW_FAILED',
      },
    });
  }
}));

/**
 * GET /api/v1/refunds/:id/audit-trail
 * Get audit trail for a specific refund (admin only)
 */
router.get('/:id/audit-trail', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
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
  await initDataSource();

  const cancelSchema = z.object({
    cancelledBy: z.string().min(1),
    cancellationReason: z.string().min(1),
  });

  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
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
    return res.status(400).json({
      success: false,
      error: {
        message: error.message || 'Failed to cancel delayed refund',
        code: 'CANCEL_FAILED',
      },
    });
  }
}));

/**
 * POST /api/v1/refunds/:id/process-delayed
 * Process a delayed refund after timelock expiration
 */
router.post('/:id/process-delayed', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  try {
    const refund = await refundService.processDelayedRefund(req.params.id);

    logger.info(`Delayed refund ${req.params.id} processed after timelock expiration`);

    return res.json({
      success: true,
      data: refund,
    });
  } catch (error: any) {
    logger.error('Failed to process delayed refund', error);
    return res.status(400).json({
      success: false,
      error: {
        message: error.message || 'Failed to process delayed refund',
        code: 'PROCESS_DELAYED_FAILED',
      },
    });
  }
}));

/**
 * POST /api/v1/refunds/:id/emergency-override
 * Emergency override to process a delayed refund immediately (admin only)
 */
router.post('/:id/emergency-override', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
  }

  const overrideSchema = z.object({
    overrideBy: z.string().min(1),
    overrideReason: z.string().min(1),
  });

  const parsed = overrideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        message: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
    });
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
    return res.status(400).json({
      success: false,
      error: {
        message: error.message || 'Failed to apply emergency override',
        code: 'EMERGENCY_OVERRIDE_FAILED',
      },
    });
  }
}));

/**
 * GET /api/v1/refunds/admin/delayed-pending
 * Get all pending delayed refunds (admin only)
 */
router.get('/admin/delayed-pending', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
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
  await initDataSource();

  // TODO: Add admin authentication middleware
  const apiKey = req.header('X-Admin-API-Key');
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Unauthorized',
        code: 'UNAUTHORIZED',
      },
    });
  }

  const refunds = await refundService.getDelayedRefundsReadyForProcessing();

  return res.json({
    success: true,
    data: refunds,
    count: refunds.length,
  });
}));

export const refundRoutes = router;
