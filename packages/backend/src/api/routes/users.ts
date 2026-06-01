import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { User } from '../../db/entities/User';
import { Passenger } from '../../db/entities/Passenger';
import { UserPreference } from '../../db/entities/UserPreference';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { passengerSchema, userPreferencesSchema } from '../schemas';

const router = Router();

const updatePreferencesSchema = userPreferencesSchema;

const ensureAuthenticatedUser = (req: Request) => {
  const walletAddress = req.user?.walletAddress;
  if (!walletAddress) {
    throw new BadRequestError('Authenticated user is required');
  }
  return walletAddress;
};

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const userRepo = AppDataSource.getRepository(User);
    let user = await userRepo.findOne({ where: { walletAddress } });
    if (!user) {
      user = userRepo.create({
        walletAddress,
        walletType: req.user!.walletType,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });
      await userRepo.save(user);
    }

    return res.json({ success: true, data: user });
  }),
);

router.get(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const preferenceRepo = AppDataSource.getRepository(UserPreference);
    let preferences = await preferenceRepo.findOne({ where: { userId: walletAddress } });

    if (!preferences) {
      preferences = preferenceRepo.create({
        userId: walletAddress,
        emailEnabled: true,
        smsEnabled: false,
        pushEnabled: true,
      });
      await preferenceRepo.save(preferences);
    }

    return res.json({ success: true, data: preferences });
  }),
);

router.put(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const preferenceRepo = AppDataSource.getRepository(UserPreference);
    let preferences = await preferenceRepo.findOne({ where: { userId: walletAddress } });

    if (!preferences) {
      preferences = preferenceRepo.create({
        userId: walletAddress,
        ...parsed.data,
      });
    } else {
      Object.assign(preferences, parsed.data);
    }

    await preferenceRepo.save(preferences);
    return res.json({ success: true, data: preferences });
  }),
);

router.get(
  '/passengers',
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passengers = await passengerRepo.find();
    return res.json({ success: true, data: passengers });
  }),
);

router.post(
  '/passengers',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = passengerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passenger = passengerRepo.create(parsed.data);
    await passengerRepo.save(passenger);

    return res.status(201).json({ success: true, data: passenger });
  }),
);

router.get(
  '/passengers/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const passenger = await passengerRepo.findOne({ where: { id: req.params.id } });
    if (!passenger) {
      throw new NotFoundError('Passenger not found');
    }
    return res.json({ success: true, data: passenger });
  }),
);

export const userRoutes = router;
