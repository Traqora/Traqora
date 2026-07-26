import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { JourneyPlanner, JourneyStop } from '../../services/journeyPlanner';

const router = Router();
const journeyPlanner = new JourneyPlanner();

const stopSchema = z.object({
  id: z.string(),
  airportCode: z.string().length(3),
  city: z.string(),
  arrival: z.string().datetime(),
  departure: z.string().datetime(),
});

const planJourneySchema = z.object({
  stops: z.array(stopSchema).min(2),
});

/**
 * POST /api/v1/journeys/plan
 * Plan a multi-stop journey with route optimization.
 */
router.post(
  '/plan',
  requireAuth,
  asyncHandler((req: Request, res: Response) => {
    const parsed = planJourneySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const journey = journeyPlanner.planJourney(parsed.data.stops as JourneyStop[]);
    return res.json(journey);
  }),
);

export default router;
