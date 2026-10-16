import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';

const router = Router();

router.get('/me', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: req.user });
}));

export const userRoutes = router;
