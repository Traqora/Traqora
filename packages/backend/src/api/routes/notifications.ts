/**
 * Notification Preferences & Management Routes
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { notificationService } from "../../services/NotificationService";
import { pushNotificationService } from "../../services/PushNotificationService";
import { logger } from "../../utils/logger";

const router = Router();

// Schemas
const preferencesUpdateSchema = z.object({
  channel: z.enum(["email", "sms", "push", "inapp"]),
  category: z.enum([
    "booking",
    "payment",
    "itinerary",
    "collaboration",
    "marketing",
    "system",
  ]),
  frequency: z.enum(["instant", "daily", "weekly", "never"]),
  enabled: z.boolean(),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  auth: z.string(),
  p256dh: z.string(),
  userAgent: z.string(),
});

const notificationSchema = z.object({
  notificationId: z.string(),
});

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get(
  "/preferences",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const { channel, category } = req.query;

    const prefs = await notificationService.getPreferences(
      userId,
      channel as any,
      category as any,
    );

    return res.json({
      userId,
      preferences: prefs,
      total: prefs.length,
    });
  }),
);

/**
 * PUT /api/notifications/preferences
 * Update notification preference
 */
router.put(
  "/preferences",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = preferencesUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const pref = await notificationService.updatePreference(
      userId,
      parsed.data,
    );

    logger.info("Preference updated via API", {
      userId,
      channel: parsed.data.channel,
    });

    return res.json({
      preference: pref,
      message: "Preference updated successfully",
    });
  }),
);

/**
 * GET /api/notifications/settings
 * Get full notification settings
 */
router.get(
  "/settings",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const settings = await notificationService.getUserSettings(userId);

    return res.json(settings);
  }),
);

/**
 * GET /api/notifications/inbox
 * Get in-app notifications
 */
router.get(
  "/inbox",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const { limit } = req.query;

    const notifications = await notificationService.getInAppNotifications(
      userId,
      limit ? parseInt(limit as string) : 50,
    );

    return res.json({
      userId,
      notifications,
      total: notifications.length,
    });
  }),
);

/**
 * POST /api/notifications/mark-read
 * Mark notification as read
 */
router.post(
  "/mark-read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = notificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const { notificationId } = parsed.data;

    await notificationService.markAsRead(userId, notificationId);

    return res.json({
      message: "Notification marked as read",
      notificationId,
    });
  }),
);

/**
 * POST /api/notifications/clear
 * Clear all notifications
 */
router.post(
  "/clear",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const count = await notificationService.clearNotifications(userId);

    return res.json({
      message: "Notifications cleared",
      clearedCount: count,
    });
  }),
);

/**
 * GET /api/notifications/stats
 * Get notification statistics
 */
router.get(
  "/stats",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const stats = await notificationService.getStatistics(userId);

    return res.json(stats);
  }),
);

/**
 * POST /api/notifications/push/subscribe
 * Subscribe to push notifications
 */
router.post(
  "/push/subscribe",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = pushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const subscription = await pushNotificationService.subscribe(
      userId,
      parsed.data,
    );

    logger.info("Push subscription created via API", { userId });

    return res.json({
      message: "Push subscription successful",
      subscriptionId: subscription.id,
    });
  }),
);

/**
 * POST /api/notifications/push/unsubscribe
 * Unsubscribe from push notifications
 */
router.post(
  "/push/unsubscribe",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: "endpoint required" });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    await pushNotificationService.unsubscribe(userId, endpoint);

    return res.json({
      message: "Push subscription removed",
    });
  }),
);

/**
 * GET /api/notifications/push/subscriptions
 * Get user push subscriptions
 */
router.get(
  "/push/subscriptions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const subscriptions =
      await pushNotificationService.getSubscriptions(userId);

    return res.json({
      userId,
      subscriptions,
      total: subscriptions.length,
    });
  }),
);

/**
 * GET /api/notifications/delivery-log
 * Get delivery logs
 */
router.get(
  "/delivery-log",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const { limit } = req.query;

    const logs = await notificationService.getDeliveryLogs(
      userId,
      limit ? parseInt(limit as string) : 100,
    );

    return res.json({
      userId,
      logs,
      total: logs.length,
    });
  }),
);

/**
 * POST /api/notifications/push/stats
 * Get push notification statistics (admin)
 */
router.get(
  "/push/stats",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const stats = await pushNotificationService.getSubscriptionStats();

    return res.json(stats);
  }),
);

export default router;
