import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { User } from '../../db/entities/User';
import { Passenger } from '../../db/entities/Passenger';
import { UserPreference } from '../../db/entities/UserPreference';
import { UserProfile } from '../../db/entities/UserProfile';
import { AccountDeletionRequest } from '../../db/entities/AccountDeletionRequest';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { passengerSchema, userPreferencesSchema, userProfileSchema } from '../schemas';
import { logger } from '../../utils/logger';

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
        walletType: req.user!.walletType as any,
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

/**
 * GET /users/me/data-export
 * GDPR/CCPA data export (issue #386). Bundles the fields directly owned by
 * the wallet-based user identity — the account record and notification
 * preferences. Bookings and passenger records are NOT included: neither
 * has a userId/walletAddress foreign key in the current schema (a
 * passenger can be booked by someone other than its account holder), so
 * there is no safe, unambiguous way to attribute them to this user
 * without a schema change. Flagging this rather than silently omitting it.
 */
router.get(
  '/me/data-export',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);

    const userRepo = AppDataSource.getRepository(User);
    const preferenceRepo = AppDataSource.getRepository(UserPreference);

    const [user, preferences] = await Promise.all([
      userRepo.findOne({ where: { walletAddress } }),
      preferenceRepo.findOne({ where: { userId: walletAddress } }),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      userId: walletAddress,
      account: user ?? null,
      preferences: preferences ?? null,
      omitted: {
        bookings: 'not linked to a wallet-based user identity in the current schema',
        passengers: 'not linked to a wallet-based user identity in the current schema',
      },
    };

    logger.info('gdpr: data export generated', { userId: walletAddress });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="traqora-data-export-${walletAddress}.json"`);
    return res.status(200).send(JSON.stringify(exportPayload, null, 2));
  }),
);

const deletionRequestSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

/**
 * POST /users/me/deletion-request
 * Right-to-deletion request (issue #386). Creates a durable, auditable
 * request record rather than deleting immediately — actual erasure is a
 * follow-on operational process (verification window, data-retention
 * legal holds, etc.), which is intentionally out of scope for this
 * endpoint per the "no breaking changes" constraint.
 */
router.post(
  '/me/deletion-request',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);

    const parsed = deletionRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const deletionRepo = AppDataSource.getRepository(AccountDeletionRequest);

    const existingPending = await deletionRepo.findOne({
      where: { userId: walletAddress, status: 'pending' },
    });
    if (existingPending) {
      return res.status(200).json({ success: true, data: existingPending, alreadyPending: true });
    }

    const request = deletionRepo.create({
      userId: walletAddress,
      status: 'pending',
      reason: parsed.data.reason ?? null,
    });
    await deletionRepo.save(request);

    logger.info('gdpr: deletion request created', { userId: walletAddress, requestId: request.id });

    return res.status(202).json({ success: true, data: request, alreadyPending: false });
  }),
);

router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const profileRepo = AppDataSource.getRepository(UserProfile);
    const profile = await profileRepo.findOne({ where: { userId: walletAddress } });

    return res.json({
      success: true,
      data: profile ?? {
        userId: walletAddress,
        displayName: null,
        bio: null,
        avatarUrl: null,
        travelPreferences: null,
      },
    });
  }),
);

router.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const parsed = userProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const profileRepo = AppDataSource.getRepository(UserProfile);
    let profile = await profileRepo.findOne({ where: { userId: walletAddress } });

    if (!profile) {
      profile = profileRepo.create({
        userId: walletAddress,
        displayName: null,
        bio: null,
        avatarUrl: null,
        travelPreferences: null,
        ...parsed.data,
      });
    } else {
      Object.assign(profile, parsed.data);
    }

    await profileRepo.save(profile);
    return res.json({ success: true, data: profile });
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
