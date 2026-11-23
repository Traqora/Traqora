import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));

export const airlineRoutes = router;
