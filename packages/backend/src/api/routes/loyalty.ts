import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { loyaltyService } from '../../services/loyalty/loyaltyService';
import { TierManager } from '../../services/loyalty/tierManager';
import { LoyaltyStore } from '../../services/loyalty/store';
import { TIER_CONFIGS } from '../../services/loyalty/tierConfig';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { loyaltyTierSchema, loyaltyActionSchema } from '../schemas';

const router = Router();

const loyaltyStore = LoyaltyStore.getInstance();
const tierManager = new TierManager(loyaltyStore);

router.get(
  '/balance',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const balance = loyaltyService.getBalance(walletAddress);
    return res.json({ success: true, data: { walletAddress, points: balance } });
  }),
);

router.post(
  '/earn',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const parsed = loyaltyActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const points = loyaltyService.addPoints(walletAddress, parsed.data.points);
    return res.status(201).json({ success: true, data: { walletAddress, points } });
  }),
);

router.post(
  '/redeem',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const parsed = loyaltyActionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const points = loyaltyService.redeemPoints(walletAddress, parsed.data.points);
    return res.status(201).json({ success: true, data: { walletAddress, points } });
  }),
);

router.post(
  '/tier',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const parsed = loyaltyTierSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const tier = loyaltyService.setTier(walletAddress, parsed.data.tier);
    return res.status(200).json({ success: true, data: { walletAddress, tier } });
  }),
);

router.get(
  '/tier',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    const tier = loyaltyService.getTier(walletAddress);
    if (!tier) {
      throw new NotFoundError('Loyalty tier not set');
    }

    return res.json({ success: true, data: { walletAddress, tier } });
  }),
);

export const loyaltyRoutes = router;
