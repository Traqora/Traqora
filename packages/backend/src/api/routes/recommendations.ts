/**
 * Destination recommendation routes.
 *
 *   GET  /recommendations             — personalized + trending destination cards
 *   POST /recommendations/engagement  — record a click/dismiss on a shown card
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError } from '../../utils/errors';
import { getRecommendations } from '../../services/recommendationService';
import { recordRecommendationEvent } from '../../services/analytics';

const router = Router();

const engagementSchema = z.object({
  destinationCode: z.string().trim().min(2).max(8),
  action: z.enum(['click', 'dismiss']),
  variant: z.enum(['personalized', 'control']),
  reason: z.string().max(64).optional(),
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const recommendations = await getRecommendations(walletAddress);
    return res.json({ success: true, data: recommendations });
  }),
);

router.post(
  '/engagement',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const parsed = engagementSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    await recordRecommendationEvent({
      userId: walletAddress,
      destinationCode: parsed.data.destinationCode,
      variant: parsed.data.variant,
      action: parsed.data.action,
      reason: parsed.data.reason,
    });

    return res.status(201).json({ success: true });
  }),
);

export const recommendationRoutes = router;
