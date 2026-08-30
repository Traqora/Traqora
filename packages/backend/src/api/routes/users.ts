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
import {
  consentGrantSchema,
  consentWithdrawSchema,
  passengerSchema,
  userPreferencesSchema,
  userProfileSchema,
} from '../schemas';
import { logger } from '../../utils/logger';
import { consentService } from '../../services/governance/consentService';

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

/**
 * GET /users/me/consent
 * Lists the caller's own currently-granted consent records (#549).
 * Scoped to the authenticated wallet — never accepts a target user id from
 * the caller, since that shape (an id-only lookup with no ownership check)
 * is exactly what made governance.ts's equivalent routes let any caller
 * view or withdraw another user's consent records; see the note there.
 */
router.get(
  '/me/consent',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const consents = await consentService.getUserConsents(walletAddress);
    return res.json({ success: true, data: consents });
  }),
);

/**
 * POST /users/me/consent
 * Grants (or re-grants, if a prior record for this consentType exists —
 * see ConsentService.grantConsent's upsert-by-type behaviour) a consent
 * record for the authenticated user. Idempotent per consentType: granting
 * an already-granted type updates the same record rather than creating a
 * duplicate.
 */
router.post(
  '/me/consent',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const parsed = consentGrantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const consent = await consentService.grantConsent({
      userWalletAddress: walletAddress,
      consentType: parsed.data.consentType,
      consentDetails: parsed.data.consentDetails,
      ipAddress: req.ip,
      userAgent: req.header('user-agent'),
      expiresAt: parsed.data.expiresAt,
    });

    return res.status(200).json({ success: true, data: consent });
  }),
);

/**
 * DELETE /users/me/consent/:consentId
 * Withdraws one of the authenticated user's own consent records.
 *
 * Ownership is verified before withdrawal — the record is looked up
 * scoped to the caller's own wallet first, and a record that doesn't
 * belong to (or doesn't exist for) this user surfaces as 404, never as a
 * silent cross-user withdrawal. ConsentService.withdrawConsent itself
 * takes only a bare consentId with no ownership check, so that guard has
 * to live here at the route boundary.
 */
router.delete(
  '/me/consent/:consentId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = ensureAuthenticatedUser(req);
    const parsed = consentWithdrawSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    // Unfiltered by id (queryConsents has no id filter) and unlimited — a
    // user can have one record per ConsentType, so an arbitrary `limit`
    // here risks missing the target record and 404ing incorrectly.
    const { records } = await consentService.queryConsents({
      userWalletAddress: walletAddress,
    });
    const owned = records.find((record) => record.id === req.params.consentId);
    if (!owned) {
      // Deliberately indistinguishable from "consent record does not
      // exist at all" — confirming existence of another user's record id
      // via a 403 would itself leak information.
      throw new NotFoundError('Consent record not found');
    }
    if (owned.status === 'withdrawn') {
      // Withdrawing an already-withdrawn record is a no-op, not an error —
      // matches deletion-request's alreadyPending idempotency pattern above.
      return res.status(200).json({ success: true, data: owned, alreadyWithdrawn: true });
    }

    const withdrawn = await consentService.withdrawConsent(
      req.params.consentId,
      parsed.data.reason,
      walletAddress,
    );

    logger.info('gdpr: consent withdrawn', { userId: walletAddress, consentId: withdrawn.id });

    return res.status(200).json({ success: true, data: withdrawn, alreadyWithdrawn: false });
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
