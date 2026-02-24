import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

router.get('/me', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: null });
}));

export const userRoutes = router;
