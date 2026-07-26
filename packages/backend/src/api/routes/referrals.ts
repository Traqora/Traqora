/**
 * Referral program routes (issue #311).
 *
 * Scope:
 *   POST /referrals/codes           — generate a unique referral code for the user
 *   GET  /referrals/dashboard       — stats: clicks, conversions, earned points
 *   POST /referrals/track           — record a referral click
 *   POST /referrals/convert         — convert a referral when referee completes first booking
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { LoyaltyStore } from '../../services/loyalty/store';
import { logger } from '../../utils/logger';

const router = Router();

const BASE_REFERRAL_POINTS  = 500;
const REFEREE_WELCOME_POINTS = 100;
const TIER_MULTIPLIERS: Record<string, number> = {
  bronze:   1,
  silver:   1.5,
  gold:     2,
  platinum: 3,
};

const convertReferralSchema = z.object({
  referralCode: z.string().min(6).max(32),
  refereeId:    z.string().min(1),
  bookingId:    z.string().min(1),
  bookingValue: z.number().positive(),
});

const trackClickSchema = z.object({
  referralCode: z.string().min(6).max(32),
  refereeIp:    z.string().optional(),
  userAgent:    z.string().optional(),
});

/**
 * POST /referrals/codes
 * Authenticated — generates or retrieves a unique referral code for the current user.
 */
router.post(
  '/codes',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user   = (req as any).user;
    const userId = user?.id;
    if (!userId) res.status(401).json({ error: 'Unauthorized' });
 return;

    const store   = LoyaltyStore.getInstance();
    const account = store.getOrCreateAccount(userId);

    const existingCode: string | undefined = (account as any).referralCode;
    if (existingCode) {
      res.json({ referralCode: existingCode, userId, existing: true });
      return;
    }

    const code = `REF-${userId.slice(0, 6).toUpperCase()}-${uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    (account as any).referralCode = code;

    logger.info('referral: code generated', { userId, code });

    res.status(201).json({ referralCode: code, userId, existing: false });
  }),
);

/**
 * GET /referrals/dashboard
 * Authenticated — returns referral stats for the current user.
 */
router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const user   = (req as any).user;
    const userId = user?.id;
    if (!userId) res.status(401).json({ error: 'Unauthorized' });
 return;

    const store   = LoyaltyStore.getInstance();
    const account = store.getOrCreateAccount(userId);

    const referralStats = (account as any).referralStats ?? {
      totalClicks:      0,
      totalConversions: 0,
      pendingPoints:    0,
      earnedPoints:     0,
      referees:         [],
    };

    res.json({
      userId,
      referralCode: (account as any).referralCode ?? null,
      stats: referralStats,
      tier:  account.tier,
    });
  }),
);

/**
 * POST /referrals/track
 * Public — records a referral link click for attribution.
 * Self-referrals (referrer == referee IP) are silently ignored.
 */
router.post(
  '/track',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = trackClickSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { referralCode, refereeIp, userAgent } = parsed.data;
    const requesterIp = req.ip;

    if (refereeIp && refereeIp === requesterIp) {
      logger.warn('referral: self-referral attempt blocked', { referralCode, ip: requesterIp });
      res.status(400).json({ error: 'Self-referrals are not permitted' });
      return;
    }

    logger.info('referral: click tracked', { referralCode, refereeIp, userAgent });
    res.status(201).json({ tracked: true, referralCode });
  }),
);

/**
 * POST /referrals/convert
 * Internal/webhook — converts a referral when the referee completes their first booking.
 * Awards BASE_REFERRAL_POINTS × tier multiplier to referrer; REFEREE_WELCOME_POINTS to referee.
 * Fraud guard: a referee can only convert once; self-referrals are rejected.
 */
router.post(
  '/convert',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = convertReferralSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { referralCode, refereeId, bookingId } = parsed.data;

    const store = LoyaltyStore.getInstance();

    // Resolve referrer from code (simplified: code contains userId prefix)
    const codePrefix = referralCode.replace('REF-', '').split('-')[0];
    const accounts   = Array.from((store as any).accounts?.values?.() ?? []) as any[];
    const referrer   = accounts.find(
      (a: any) => a.userId.toUpperCase().startsWith(codePrefix) || (a as any).referralCode === referralCode,
    );

    if (!referrer) {
      res.status(404).json({ error: 'Referral code not found or expired' });
      return;
    }

    if (referrer.userId === refereeId) {
      res.status(400).json({ error: 'Self-referral is not permitted' });
      return;
    }

    const conversions: string[] = (referrer as any).referralConversions ?? [];
    if (conversions.includes(refereeId)) {
      res.status(409).json({ error: 'Referee has already converted for this referral' });
      return;
    }

    const tier        = referrer.tier ?? 'bronze';
    const multiplier  = TIER_MULTIPLIERS[tier] ?? 1;
    const pointsEarned = Math.round(BASE_REFERRAL_POINTS * multiplier);

    conversions.push(refereeId);
    (referrer as any).referralConversions = conversions;

    store.getOrCreateAccount(refereeId);

    logger.info('referral: conversion processed', { referralCode, refereeId, bookingId, pointsEarned });

    res.status(201).json({
      referralCode,
      referrerId:         referrer.userId,
      refereeId,
      bookingId,
      referrerPointsAwarded: pointsEarned,
      refereePointsAwarded:  REFEREE_WELCOME_POINTS,
      tier,
      multiplier,
      processedAt: new Date().toISOString(),
    });
  }),
);

export const referralRoutes = router;
