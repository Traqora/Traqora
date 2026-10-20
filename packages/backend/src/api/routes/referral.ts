// @ts-ignore
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { AppDataSource } from '../../db/dataSource';
import { Referral } from '../../db/entities/Referral';
import { User } from '../../db/entities/User';
import { referralFraudDetection, ReferralContext } from '../../services/referralFraudDetection';
import { logger } from '../../utils/logger';
import { createReferralLinkSchema, sendReferralInviteSchema, completeReferralSchema } from '../../api/schemas/index';
import { requireAuth } from '../../middleware/authMiddleware';

const router = Router();

/**
 * POST /api/v1/referral
 * Create a referral link or send an invite
 */
router.post('/', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const createLinkSchema = z.object({ createLink: z.literal(true) });
  const createLinkParsed = createLinkSchema.safeParse(req.body);

  if (createLinkParsed.success) {
    // Create referral link
    const referrerId = req.user?.walletAddress;
    if (!referrerId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const referralCode = generateReferralCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days expiry

    const referral = AppDataSource.getRepository(Referral).create({
      referrerId,
      referralCode,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    await AppDataSource.getRepository(Referral).save(referral);

    const referralUrl = `${process.env.APP_URL || 'https://traqora.com'}/referral/${referralCode}`;

    return res.status(201).json({
      success: true,
      data: {
        url: referralUrl,
        code: referralCode,
        expiresAt: referral.expiresAt,
      },
    });
  }

  // Send invite
  const inviteParsed = sendReferralInviteSchema.safeParse(req.body);
  if (!inviteParsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: inviteParsed.error.flatten(),
      },
    });
  }

  const referrerId = req.user?.walletAddress;
  if (!referrerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = inviteParsed.data;

  // Build fraud detection context
  const userRepo = AppDataSource.getRepository(User);
  const referrer = await userRepo.findOne({ where: { walletAddress: referrerId } });

  const context: ReferralContext = {
    referrerId,
    referrerEmail: req.user?.email,
    referrerWallet: referrerId,
    referredEmail: email,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    timestamp: new Date(),
    referrerAccountAge: referrer ? Math.floor((Date.now() - referrer.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0,
    referrerTotalReferrals: await AppDataSource.getRepository(Referral).count({ where: { referrerId } }),
  };

  // Run fraud detection
  const fraudCheck = await referralFraudDetection.detectFraud(context);

  if (fraudCheck.blockAction) {
    logger.warn('Referral blocked due to fraud detection', {
      referrerId,
      riskScore: fraudCheck.riskScore,
      reasons: fraudCheck.reasons,
    });

    return res.status(403).json({
      error: {
        code: 'FRAUD_DETECTED',
        message: 'Referral blocked due to suspicious activity',
        riskScore: fraudCheck.riskScore,
        reasons: fraudCheck.reasons,
      },
    });
  }

  // Create referral record
  const referralCode = generateReferralCode();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const referral = AppDataSource.getRepository(Referral).create({
    referrerId,
    referrerEmail: req.user?.email,
    referredEmail: email,
    referralCode,
    expiresAt,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
    riskScore: fraudCheck.riskScore,
    fraudCheckResults: fraudCheck,
    isBlocked: fraudCheck.blockAction,
    blockReason: fraudCheck.blockAction ? fraudCheck.reasons.join(', ') : null,
  });

  await AppDataSource.getRepository(Referral).save(referral);

  // TODO: Send email invite

  return res.status(201).json({
    success: true,
    data: {
      referralCode,
      expiresAt,
      riskScore: fraudCheck.riskScore,
    },
  });
}));

/**
 * POST /api/v1/referral/complete
 * Complete a referral (when referred user signs up)
 */
router.post('/complete', asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const parsed = completeReferralSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: parsed.error.flatten(),
      },
    });
  }

  const { referralCode, walletAddress } = parsed.data;

  const referralRepo = AppDataSource.getRepository(Referral);
  const referral = await referralRepo.findOne({ where: { referralCode } });

  if (!referral) {
    return res.status(404).json({
      error: {
        code: 'REFERRAL_NOT_FOUND',
        message: 'Invalid referral code',
      },
    });
  }

  if (referral.isBlocked) {
    return res.status(403).json({
      error: {
        code: 'REFERRAL_BLOCKED',
        message: 'This referral has been blocked',
      },
    });
  }

  if (referral.isCompleted) {
    return res.status(400).json({
      error: {
        code: 'REFERRAL_ALREADY_COMPLETED',
        message: 'This referral has already been completed',
      },
    });
  }

  if (referral.expiresAt && new Date() > referral.expiresAt) {
    return res.status(400).json({
      error: {
        code: 'REFERRAL_EXPIRED',
        message: 'This referral has expired',
      },
    });
  }

  // Mark referral as completed
  referral.isCompleted = true;
  referral.completedAt = new Date();
  referral.referredWallet = walletAddress;

  await referralRepo.save(referral);

  // TODO: Award referral bonus points

  return res.json({
    success: true,
    data: {
      referralId: referral.id,
      referrerId: referral.referrerId,
      completedAt: referral.completedAt,
    },
  });
}));

/**
 * GET /api/v1/referral/stats
 * Get referral statistics for the current user
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const referrerId = req.user?.walletAddress;
  if (!referrerId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const referralRepo = AppDataSource.getRepository(Referral);

  const [total, completed, pending, blocked] = await Promise.all([
    referralRepo.count({ where: { referrerId } }),
    referralRepo.count({ where: { referrerId, isCompleted: true } }),
    referralRepo.count({ where: { referrerId, isCompleted: false, isBlocked: false } }),
    referralRepo.count({ where: { referrerId, isBlocked: true } }),
  ]);

  return res.json({
    success: true,
    data: {
      total,
      completed,
      pending,
      blocked,
      conversionRate: total > 0 ? (completed / total) * 100 : 0,
    },
  });
}));

/**
 * GET /api/v1/referral/:id
 * Get referral details
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  await AppDataSource.initialize();

  const referral = await AppDataSource.getRepository(Referral).findOne({
    where: { id: req.params.id },
  });

  if (!referral) {
    return res.status(404).json({
      error: {
        code: 'REFERRAL_NOT_FOUND',
        message: 'Referral not found',
      },
    });
  }

  // Only allow referrer to see their own referrals
  if (referral.referrerId !== req.user?.walletAddress) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  return res.json({
    success: true,
    data: referral,
  });
}));

/**
 * Generate a random referral code
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const referralRoutes = router;
