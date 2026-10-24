import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { BadRequestError } from '../../utils/errors';
import { journeyPlannerService } from '../../services/journeyPlanner';

const router = Router();

const stopSchema = z.object({
  city: z.string().min(1),
  airportCode: z.string().min(3).max(4).toUpperCase(),
  arrivalDate: z.string(),
  departureDate: z.string(),
  timezone: z.string().optional(),
  activities: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const createJourneySchema = z.object({
  title: z.string().min(1).max(150),
  description: z.string().max(500).optional(),
  stops: z.array(stopSchema).min(2),
  isPublic: z.boolean().optional(),
});

const optimizeSchema = z.object({
  stops: z.array(stopSchema).min(2),
});

// GET /api/v1/journeys/templates
router.get(
  '/templates',
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = journeyPlannerService.getTemplates();
    return res.json({ success: true, data: templates });
  })
);

// GET /api/v1/journeys/share/:token
router.get(
  '/share/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const journey = await journeyPlannerService.getJourneyByShareToken(req.params.token);
    return res.json({ success: true, data: journey });
  })
);

// POST /api/v1/journeys/optimize
router.post(
  '/optimize',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = optimizeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid stops payload for optimization', parsed.error.flatten());
    }

    const stopsWithIds = parsed.data.stops.map((s, idx) => ({
      ...s,
      id: `temp-${idx}`,
      timezone: s.timezone || 'UTC',
      sequenceOrder: idx + 1,
    }));

    const result = journeyPlannerService.optimizeRoute(stopsWithIds);
    return res.json({ success: true, data: result });
  })
);

// POST /api/v1/journeys
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createJourneySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userId = req.user?.id || req.user?.walletAddress || 'demo-user-id';
    const journey = await journeyPlannerService.createJourney({
      userId,
      title: parsed.data.title,
      description: parsed.data.description,
      stops: parsed.data.stops,
      isPublic: parsed.data.isPublic,
    });

    return res.status(201).json({ success: true, data: journey });
  })
);

// GET /api/v1/journeys
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.walletAddress || 'demo-user-id';
    const journeys = await journeyPlannerService.listUserJourneys(userId);
    return res.json({ success: true, data: journeys });
  })
);

// GET /api/v1/journeys/:id
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.walletAddress;
    const journey = await journeyPlannerService.getJourney(req.params.id, userId);
    return res.json({ success: true, data: journey });
  })
);

// GET /api/v1/journeys/:id/export.ics
router.get(
  '/:id/export.ics',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.walletAddress;
    const journey = await journeyPlannerService.getJourney(req.params.id, userId);
    const icsContent = journeyPlannerService.generateCalendarIcs(journey);

    res.set({
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="journey-${journey.id}.ics"`,
    });
    return res.send(icsContent);
  })
);

// PUT /api/v1/journeys/:id
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.walletAddress || 'demo-user-id';
    const journey = await journeyPlannerService.updateJourney(req.params.id, userId, req.body);
    return res.json({ success: true, data: journey });
  })
);

// DELETE /api/v1/journeys/:id
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.walletAddress || 'demo-user-id';
    await journeyPlannerService.deleteJourney(req.params.id, userId);
    return res.json({ success: true, data: null });
  })
);

export default router;
