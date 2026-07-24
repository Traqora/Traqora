import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { notificationPreferencesService } from '../../services/NotificationPreferencesService';
import { NOTIFICATION_TYPES, NOTIFICATION_CHANNELS } from '../../db/entities/NotificationPreference';
import { BadRequestError, NotFoundError } from '../../utils/errors';
import { logger } from '../../utils/logger';

const router = Router();

// Validation schemas
const updatePreferencesSchema = z.object({
  emailEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  webhookEnabled: z.boolean().optional(),
  email: z.string().email().optional().nullable(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be in E.164 format').optional().nullable(),
  fcmToken: z.string().optional().nullable(),
  webhookUrl: z.string().url().optional().nullable(),
  typeChannelPreferences: z.record(
    z.enum(NOTIFICATION_TYPES as unknown as [string, ...string[]]),
    z.array(z.enum(NOTIFICATION_CHANNELS as unknown as [string, ...string[]])),
  ).optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM format').optional(),
  quietHoursTimezone: z.string().optional(),
  digestEnabled: z.boolean().optional(),
  digestFrequency: z.enum(['instant', 'daily', 'weekly']).optional(),
  maxEmailPerHour: z.number().int().min(1).max(100).optional(),
  maxSmsPerHour: z.number().int().min(0).max(50).optional(),
  maxPushPerHour: z.number().int().min(0).max(100).optional(),
  maxInAppPerHour: z.number().int().min(0).max(200).optional(),
  metadata: z.record(z.any()).optional(),
});

const setTypeChannelSchema = z.object({
  type: z.enum(NOTIFICATION_TYPES as unknown as [string, ...string[]]),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS as unknown as [string, ...string[]])),
});

/**
 * GET /api/v1/notifications/preferences
 * Get notification preferences for the authenticated user
 */
router.get(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const preferences = await notificationPreferencesService.getPreferences(userId);

    return res.json({
      success: true,
      data: preferences,
    });
  })
);

/**
 * PUT /api/v1/notifications/preferences
 * Update notification preferences for the authenticated user
 */
router.put(
  '/preferences',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const preferences = await notificationPreferencesService.updatePreferences(userId, parsed.data);

    logger.info(`Notification preferences updated for user ${userId}`);

    return res.json({
      success: true,
      data: preferences,
    });
  })
);

/**
 * POST /api/v1/notifications/preferences/reset
 * Reset notification preferences to defaults
 */
router.post(
  '/preferences/reset',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const preferences = await notificationPreferencesService.resetPreferences(userId);

    return res.json({
      success: true,
      data: preferences,
    });
  })
);

/**
 * PUT /api/v1/notifications/preferences/channels
 * Set per-type channel preferences
 */
router.put(
  '/preferences/channels',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const parsed = setTypeChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const preferences = await notificationPreferencesService.setTypeChannelPreferences(
      userId,
      parsed.data.type as any,
      parsed.data.channels as any,
    );

    return res.json({
      success: true,
      data: preferences,
    });
  })
);

/**
 * GET /api/v1/notifications/preferences/effective-channels/:type
 * Get effective channels for a specific notification type
 */
router.get(
  '/preferences/effective-channels/:type',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      throw new BadRequestError('User ID not found');
    }

    const { type } = req.params;
    if (!NOTIFICATION_TYPES.includes(type as any)) {
      throw new BadRequestError(`Invalid notification type: ${type}`);
    }

    const channels = await notificationPreferencesService.getEffectiveChannels(userId, type as any);

    return res.json({
      success: true,
      data: { type, channels },
    });
  })
);

export const notificationPreferenceRoutes = router;