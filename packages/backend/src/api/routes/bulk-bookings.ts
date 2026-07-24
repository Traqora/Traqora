import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { BulkBookingService } from '../../services/bulkBookingService';
import { BadRequestError, NotFoundError, ConflictError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();
const bulkBookingService = BulkBookingService.getInstance();

// Create bulk booking schema
const createBulkBookingSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['corporate', 'agency', 'group', 'custom']).optional(),
  organizationName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  bookings: z.array(z.object({
    flightId: z.string().uuid(),
    passenger: z.object({
      email: z.string().email(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      phone: z.string().optional(),
      sorobanAddress: z.string().min(1),
    }),
  })).min(1).max(100),
  metadata: z.record(z.any()).optional(),
  notes: z.string().optional(),
});

// Cancel bulk booking schema
const cancelBulkBookingSchema = z.object({
  reason: z.string().min(1),
});

/**
 * POST /api/v1/bulk-bookings
 * Create a new bulk booking
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createBulkBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const idempotencyKey = req.header('Idempotency-Key');

    try {
      const result = await bulkBookingService.createBulkBooking(parsed.data, idempotencyKey);

      logger.info(`Bulk booking created: ${result.bulkBooking.id} with ${result.successfulBookings.length} successful bookings`);

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to create bulk booking', error);
      throw new BadRequestError(error.message || 'Failed to create bulk booking');
    }
  })
);

/**
 * GET /api/v1/bulk-bookings/:id
 * Get bulk booking by ID
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const bulkBooking = await bulkBookingService.getBulkBooking(req.params.id);

    if (!bulkBooking) {
      throw new NotFoundError('Bulk booking not found');
    }

    return res.json({
      success: true,
      data: bulkBooking,
    });
  })
);

/**
 * GET /api/v1/bulk-bookings
 * Get bulk bookings with optional filters
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { organization, email, status, type } = req.query;

    let bulkBookings;

    if (organization) {
      bulkBookings = await bulkBookingService.getBulkBookingsByOrganization(organization as string);
    } else if (email) {
      bulkBookings = await bulkBookingService.getBulkBookingsByEmail(email as string);
    } else {
      throw new BadRequestError('Must provide either organization or email filter');
    }

    // Apply additional filters
    if (status) {
      bulkBookings = bulkBookings.filter(b => b.status === status);
    }
    if (type) {
      bulkBookings = bulkBookings.filter(b => b.type === type);
    }

    return res.json({
      success: true,
      data: bulkBookings,
    });
  })
);

/**
 * GET /api/v1/bulk-bookings/stats
 * Get bulk booking statistics
 */
router.get(
  '/stats/overview',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { organization } = req.query;

    const stats = await bulkBookingService.getBulkBookingStats(organization as string);

    return res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * POST /api/v1/bulk-bookings/:id/cancel
 * Cancel a bulk booking
 */
router.post(
  '/:id/cancel',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = cancelBulkBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    try {
      const bulkBooking = await bulkBookingService.cancelBulkBooking(
        req.params.id,
        parsed.data.reason
      );

      logger.info(`Bulk booking ${req.params.id} cancelled`);

      return res.json({
        success: true,
        data: bulkBooking,
      });
    } catch (error: any) {
      logger.error('Failed to cancel bulk booking', error);
      throw new BadRequestError(error.message || 'Failed to cancel bulk booking');
    }
  })
);

/**
 * POST /api/v1/bulk-bookings/:id/retry
 * Retry failed bookings in a bulk booking
 */
router.post(
  '/:id/retry',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const result = await bulkBookingService.retryFailedBookings(req.params.id);

      logger.info(`Retry attempted for bulk booking ${req.params.id}`);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      logger.error('Failed to retry bulk booking', error);
      throw new BadRequestError(error.message || 'Failed to retry bulk booking');
    }
  })
);

/**
 * DELETE /api/v1/bulk-bookings/:id
 * Delete a bulk booking (soft delete)
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await bulkBookingService.deleteBulkBooking(req.params.id);

      logger.info(`Bulk booking ${req.params.id} deleted`);

      return res.json({
        success: true,
        message: 'Bulk booking deleted successfully',
      });
    } catch (error: any) {
      logger.error('Failed to delete bulk booking', error);
      throw new BadRequestError(error.message || 'Failed to delete bulk booking');
    }
  })
);

export const bulkBookingRoutes = router;
