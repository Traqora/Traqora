import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { connected: false } });
}));

export const walletRoutes = router;
