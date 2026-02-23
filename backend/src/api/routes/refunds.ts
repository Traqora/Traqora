import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

router.post('/', asyncHandler(async (_req: Request, res: Response) => {
  res.status(501).json({ success: false, error: { message: 'Not implemented', code: 'NOT_IMPLEMENTED' } });
}));

export const refundRoutes = router;
