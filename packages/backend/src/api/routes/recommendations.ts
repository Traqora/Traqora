import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { RecommendationService } from '../../services/recommendationService';

const router = Router();
const recommendationService = new RecommendationService();

const preferencesSchema = z.object({
  preferredAirlines: z.array(z.string()).optional(),
  preferredRoutes: z.array(z.string()).optional(),
  budgetRange: z.object({ min: z.number(), max: z.number() }).optional(),
  travelStyle: z.enum(['budget', 'standard', 'premium']).optional(),
});

/**
 * GET /api/recommendations/destinations
 * Get personalized destination recommendations.
 */
router.get(
  '/destinations',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || 'anonymous';
    const prefs = preferencesSchema.safeParse(req.query);
    const preferences = prefs.success ? prefs.data : {};

    const bookingHistory: Array<{ route: string; amount: number }> = [];
    const recommendations = await recommendationService.getRecommendations(
      userId,
      preferences,
      bookingHistory,
    );

    return res.json({ recommendations });
  }),
);

export default router;
