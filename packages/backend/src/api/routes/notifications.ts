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

/** Extract the authenticated user's ID (walletAddress) from the request */
function getUserId(req: Request): string {
  return (req as any).user?.walletAddress ?? (req as any).userId ?? "";
}

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
    const userId = getUserId(req);
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

    const userId = getUserId(req);
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
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

    const userId = getUserId(req);
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
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

    const userId = getUserId(req);
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

    const userId = getUserId(req);
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
    const userId = getUserId(req);
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
    const userId = getUserId(req);
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
 * GET /api/notifications/push/stats
 * Get push notification statistics
 */
router.get(
  "/push/stats",
  requireAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await pushNotificationService.getSubscriptionStats();
    return res.json(stats);
  }),
);

/**
 * POST /api/notifications/mark-all-read
 * Mark all in-app notifications as read
 */
router.post(
  "/mark-all-read",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const count = await notificationService.markAllAsRead(userId);
    return res.json({ message: "All notifications marked as read", count });
  }),
);

// Schema for DND settings
const dndSchema = z.object({
  enabled: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:mm"),
  timezone: z.string(),
});

/**
 * PUT /api/notifications/settings/dnd
 * Update Do-Not-Disturb window
 */
router.put(
  "/settings/dnd",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = dndSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = getUserId(req);
    const settings = await notificationService.updateUserSettings(userId, {
      doNotDisturb: parsed.data,
    });

    logger.info("DND settings updated via API", { userId });

    return res.json({
      message: "Do-Not-Disturb settings updated",
      doNotDisturb: settings.doNotDisturb,
    });
  }),
);

/**
 * PUT /api/notifications/settings/contact
 * Update contact details used for delivery (email + phone)
 */
const contactSchema = z.object({
  emailAddress: z.string().email().optional(),
  phoneNumber: z.string().optional(),
});

router.put(
  "/settings/contact",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = getUserId(req);
    const settings = await notificationService.updateUserSettings(
      userId,
      parsed.data,
    );

    return res.json({
      message: "Contact settings updated",
      emailAddress: settings.emailAddress,
      phoneNumber: settings.phoneNumber,
    });
  }),
);

export default router;

