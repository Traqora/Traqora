import { Router, Request, Response } from 'express';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { User } from '../../db/entities/User';
import { BadRequestError } from '../../utils/errors';
import { walletVerifySchema } from '../schemas';

const router = Router();
const supportedWalletTypes = ['freighter', 'albedo', 'rabet'] as const;

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    const walletType = req.user?.walletType;
    if (!walletAddress || !walletType) {
      throw new BadRequestError('Authenticated wallet is required');
    }

    return res.json({ success: true, data: { walletAddress, walletType } });
  }),
);

router.get(
  '/supported-types',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    return res.json({ success: true, data: supportedWalletTypes });
  }),
);

router.post(
  '/verify',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = walletVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const valid = supportedWalletTypes.includes(parsed.data.walletType);
    return res.json({ success: true, data: { valid, ...parsed.data } });
  }),
);

router.post(
  '/register',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = walletVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({ where: { walletAddress: parsed.data.walletAddress } });
    if (!user) {
      user = userRepo.create({
        walletAddress: parsed.data.walletAddress,
        walletType: parsed.data.walletType,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
    } else {
      user.walletType = parsed.data.walletType;
      user.lastLoginAt = new Date();
    }

    await userRepo.save(user);
    return res.status(201).json({ success: true, data: user });
  }),
);

export const walletRoutes = router;
