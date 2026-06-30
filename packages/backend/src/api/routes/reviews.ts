import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { ReviewService } from '../../services/reviewService';
import { logger } from '../../utils/logger';

const router = Router();
const reviewService = ReviewService.getInstance();

// Validation schemas
const createReviewSchema = z.object({
  airlineCode: z.string().min(2).max(10),
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(200).optional(),
  content: z.string().max(2000).optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});

const updateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().max(200).optional(),
  content: z.string().max(2000).optional(),
  pros: z.array(z.string()).optional(),
  cons: z.array(z.string()).optional(),
});

const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  moderatorNote: z.string().optional(),
});

/**
 * POST /api/v1/reviews
 * Create a new airline review
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const review = await reviewService.createReview({
      airlineCode: parsed.data.airlineCode,
      bookingId: parsed.data.bookingId,
      userId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      content: parsed.data.content,
      pros: parsed.data.pros,
      cons: parsed.data.cons,
    });

    return res.status(201).json({
      success: true,
      data: review,
    });
  })
);

/**
 * GET /api/v1/reviews
 * Get reviews with filters
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const airlineCode = req.query.airlineCode as string | undefined;
    const rating = req.query.rating ? parseInt(req.query.rating as string, 10) : undefined;
    const status = req.query.status as any;
    const isVerified = req.query.isVerified === 'true' ? true : req.query.isVerified === 'false' ? false : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;

    if (!airlineCode) {
      throw new BadRequestError('airlineCode query parameter is required');
    }

    const result = await reviewService.getReviews({
      airlineCode,
      rating,
      status,
      isVerified,
      limit,
      offset,
    });

    return res.json({
      success: true,
      data: result.reviews,
      total: result.total,
      limit,
      offset,
    });
  })
);

/**
 * GET /api/v1/reviews/:id
 * Get a specific review
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const review = await reviewService.getReviewById(req.params.id);

    if (!review) {
      throw new NotFoundError('Review not found');
    }

    return res.json({
      success: true,
      data: review,
    });
  })
);

/**
 * PUT /api/v1/reviews/:id
 * Update a review
 */
router.put(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const review = await reviewService.updateReview(
      req.params.id,
      userId,
      parsed.data
    );

    return res.json({
      success: true,
      data: review,
    });
  })
);

/**
 * DELETE /api/v1/reviews/:id
 * Delete a review
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    await reviewService.deleteReview(req.params.id, userId);

    return res.json({
      success: true,
      message: 'Review deleted successfully',
    });
  })
);

/**
 * GET /api/v1/reviews/airline/:airlineCode/stats
 * Get airline review statistics
 */
router.get(
  '/airline/:airlineCode/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { airlineCode } = req.params;

    const stats = await reviewService.getAirlineStats(airlineCode);

    return res.json({
      success: true,
      data: stats,
    });
  })
);

/**
 * GET /api/v1/reviews/airline/:airlineCode/can-review
 * Check if user can review an airline
 */
router.get(
  '/airline/:airlineCode/can-review',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { airlineCode } = req.params;
    const bookingId = req.query.bookingId as string;

    if (!bookingId) {
      throw new BadRequestError('bookingId query parameter is required');
    }

    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const canReview = await reviewService.canUserReview(airlineCode, bookingId, userId);

    return res.json({
      success: true,
      data: { canReview },
    });
  })
);

/**
 * POST /api/v1/reviews/:id/moderate
 * Admin endpoint to moderate a review
 */
router.post(
  '/:id/moderate',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    // TODO: Add admin role check
    const parsed = moderateReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const review = await reviewService.moderateReview(
      req.params.id,
      parsed.data.status,
      parsed.data.moderatorNote
    );

    return res.json({
      success: true,
      data: review,
    });
  })
);

export const reviewRoutes = router;