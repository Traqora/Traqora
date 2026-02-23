import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';

const router = Router();

router.get('/balance/:address', asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { address: req.params.address, balance: 0 } });
}));

export const loyaltyRoutes = router;
