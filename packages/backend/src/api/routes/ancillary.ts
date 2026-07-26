import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AncillaryService, AncillarySelection } from '../../services/ancillaryService';

const router = Router();
const ancillaryService = AncillaryService.getInstance();

const addAncillariesSchema = z.object({
  bookingId: z.string().uuid(),
  items: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().int().positive().max(10).default(1),
    }),
  ).min(1),
});

/**
 * GET /api/v1/ancillaries
 * Return available ancillary products.
 */
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const catalog = ancillaryService.getCatalog();
    return res.json({ ancillaries: catalog });
  }),
);

/**
 * POST /api/v1/ancillaries
 * Add ancillaries to a booking.
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = addAncillariesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { bookingId, items } = parsed.data;
    const result = await ancillaryService.addAncillaries(bookingId, items as AncillarySelection[]);
    return res.json(result);
  }),
);

/**
 * GET /api/v1/ancillaries/:bookingId
 * List ancillaries for a booking.
 */
router.get(
  '/:bookingId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const result = await ancillaryService.getAncillaries(req.params.bookingId);
    if (!result) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    return res.json(result);
  }),
);

export default router;
