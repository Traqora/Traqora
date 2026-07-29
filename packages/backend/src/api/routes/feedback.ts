import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { FeedbackService } from '../../services/feedbackService';
import { requireAuth } from '../../middleware/authMiddleware';
import { requireAdmin } from '../../middleware/adminAuth';
import { BadRequestError, UnauthorizedError } from '../../utils/errors';

const router = Router();
const feedbackService = FeedbackService.getInstance();

const targetTypeSchema = z.enum(['flight', 'airline', 'booking_experience']);
const ratingSchema = z.number().int().min(1).max(5);

const categoryRatingsSchema = z
  .object({
    comfort: ratingSchema.optional(),
    service: ratingSchema.optional(),
    punctuality: ratingSchema.optional(),
    value: ratingSchema.optional(),
    cleanliness: ratingSchema.optional(),
    bookingEase: ratingSchema.optional(),
  })
  .nullish();

const submitSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().min(1).max(128),
  rating: ratingSchema,
  categoryRatings: categoryRatingsSchema,
  title: z.string().max(200).nullish(),
  comment: z.string().max(5000).nullish(),
  bookingId: z.string().min(1).max(128).nullish(),
});

const listQuerySchema = z.object({
  targetType: targetTypeSchema.optional(),
  targetId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'flagged']).optional(),
  minRating: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const moderateSchema = z.object({
  status: z.enum(['approved', 'rejected', 'flagged']),
  note: z.string().max(2000).optional(),
});

const voteSchema = z.object({
  value: z.enum(['helpful', 'unhelpful']),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

function requireUserId(req: Request): string {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) throw new UnauthorizedError('Authentication required');
  return String(userId);
}

/**
 * GET /api/v1/feedback
 * Public listing. Callers cannot page through unmoderated content — the
 * status filter is pinned to `approved` unless an admin key is present.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const result = await feedbackService.listFeedback({
      ...parsed.data,
      status: 'approved',
    });
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/v1/feedback/aggregate?targetType=&targetId=
 * Average rating, star distribution, and per-category averages.
 */
router.get(
  '/aggregate',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({ targetType: targetTypeSchema, targetId: z.string().min(1) })
      .safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const aggregate = await feedbackService.getRatingAggregate(
      parsed.data.targetType,
      parsed.data.targetId,
    );
    return res.json({ success: true, data: aggregate });
  }),
);

/**
 * GET /api/v1/feedback/mine
 */
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const result = await feedbackService.listFeedback({ ...parsed.data, userId });
    return res.json({ success: true, data: result });
  }),
);

/**
 * GET /api/v1/feedback/moderation/queue  (admin)
 */
router.get(
  '/moderation/queue',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const queue = await feedbackService.getModerationQueue(
      parsed.data.page,
      parsed.data.limit,
    );
    return res.json({ success: true, data: queue });
  }),
);

/**
 * GET /api/v1/feedback/analytics  (admin)
 */
router.get(
  '/analytics',
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const analytics = await feedbackService.getAnalytics();
    return res.json({ success: true, data: analytics });
  }),
);

/**
 * POST /api/v1/feedback
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const feedback = await feedbackService.submitFeedback({ ...parsed.data, userId });
    return res.status(201).json({ success: true, data: feedback });
  }),
);

/**
 * GET /api/v1/feedback/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const feedback = await feedbackService.getFeedback(req.params.id);
    return res.json({ success: true, data: feedback });
  }),
);

/**
 * POST /api/v1/feedback/:id/vote
 */
router.post(
  '/:id/vote',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const parsed = voteSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const feedback = await feedbackService.voteFeedback(
      req.params.id,
      userId,
      parsed.data.value,
    );
    return res.json({ success: true, data: feedback });
  }),
);

/**
 * DELETE /api/v1/feedback/:id/vote
 */
router.delete(
  '/:id/vote',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = requireUserId(req);
    const feedback = await feedbackService.removeVote(req.params.id, userId);
    return res.json({ success: true, data: feedback });
  }),
);

/**
 * PATCH /api/v1/feedback/:id/moderate  (admin)
 */
router.patch(
  '/:id/moderate',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = moderateSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Validation error', parsed.error.flatten());

    const feedback = await feedbackService.moderateFeedback(
      req.params.id,
      parsed.data.status,
      req.admin?.adminId ?? 'system',
      parsed.data.note,
    );
    return res.json({ success: true, data: feedback });
  }),
);

export const feedbackRoutes = router;
