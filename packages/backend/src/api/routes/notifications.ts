/**
 * Notification Preferences & Management Routes
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { notificationService } from "../../services/NotificationService";
import { pushNotificationService } from "../../services/PushNotificationService";
import { MultiChannelNotificationService } from "../../services/MultiChannelNotificationService";
import { EmailNotificationChannel } from "../../services/channels/EmailNotificationChannel";
import { SMSNotificationChannel } from "../../services/channels/SMSNotificationChannel";
import { PushNotificationChannel } from "../../services/channels/PushNotificationChannel";
import { InAppNotificationChannel } from "../../services/channels/InAppNotificationChannel";
import { logger } from "../../utils/logger";

const router = Router();

// Initialize multi-channel service
let multiChannelService: MultiChannelNotificationService;

function initializeMultiChannelService() {
  if (!multiChannelService) {
    multiChannelService = new MultiChannelNotificationService();
    
    // Register channels
    const emailChannel = new EmailNotificationChannel({
      fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@traqora.com',
      fromName: process.env.EMAIL_FROM_NAME || 'Traqora',
    });
    
    const smsChannel = new SMSNotificationChannel({
      provider: (process.env.SMS_PROVIDER as any) || 'twilio',
      apiKey: process.env.SMS_API_KEY,
      apiSecret: process.env.SMS_API_SECRET,
      fromNumber: process.env.SMS_FROM_NUMBER,
    });
    
    const pushChannel = new PushNotificationChannel({
      vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
      vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
      subject: process.env.VAPID_SUBJECT || 'mailto:admin@traqora.com',
    });
    
    const inAppChannel = new InAppNotificationChannel();
    
    multiChannelService.registerChannel(emailChannel);
    multiChannelService.registerChannel(smsChannel);
    multiChannelService.registerChannel(pushChannel);
    multiChannelService.registerChannel(inAppChannel);
  }
  
  return multiChannelService;
}

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
 * Get user notification preferences from database
 */
router.get(
  "/preferences/db",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const service = initializeMultiChannelService();
    
    const preferences = await service.getUserPreferences(userId);

    return res.json({
      userId,
      preferences,
      total: preferences.length,
    });
  }),
);

/**
 * PUT /api/notifications/preferences/db
 * Update notification preference in database
 */
router.put(
  "/preferences/db",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      channel: z.enum(["email", "sms", "push", "inapp"]),
      category: z.enum([
        "booking",
        "payment",
        "itinerary",
        "collaboration",
        "marketing",
        "system",
      ]),
      frequency: z.enum(["instant", "daily", "weekly", "never"]).optional(),
      enabled: z.boolean(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const service = initializeMultiChannelService();
    
    const preference = await service.updatePreference(
      userId,
      parsed.data.channel,
      parsed.data.category,
      {
        enabled: parsed.data.enabled,
        frequency: parsed.data.frequency,
      },
    );

    logger.info("Database preference updated via API", {
      userId,
      channel: parsed.data.channel,
    });

    return res.json({
      preference,
      message: "Preference updated successfully",
    });
  }),
);

/**
 * POST /api/notifications/preferences/batch
 * Batch update notification preferences
 */
router.post(
  "/preferences/batch",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.array(
      z.object({
        channel: z.enum(["email", "sms", "push", "inapp"]),
        category: z.enum([
          "booking",
          "payment",
          "itinerary",
          "collaboration",
          "marketing",
          "system",
        ]),
        enabled: z.boolean(),
        frequency: z.enum(["instant", "daily", "weekly", "never"]).optional(),
      })
    );

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const service = initializeMultiChannelService();
    
    const preferences = await service.batchUpdatePreferences(userId, parsed.data);

    logger.info("Batch preferences updated via API", {
      userId,
      count: preferences.length,
    });

    return res.json({
      preferences,
      message: "Preferences updated successfully",
    });
  }),
);

/**
 * DELETE /api/notifications/preferences
 * Reset all preferences to defaults
 */
router.delete(
  "/preferences",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const service = initializeMultiChannelService();
    
    await service.resetPreferences(userId);

    logger.info("Preferences reset via API", { userId });

    return res.json({
      message: "Preferences reset successfully",
    });
  }),
);

/**
 * POST /api/notifications/send
 * Send notification via multiple channels
 */
router.post(
  "/send",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      userId: z.string(),
      category: z.enum([
        "booking",
        "payment",
        "itinerary",
        "collaboration",
        "marketing",
        "system",
      ]),
      title: z.string(),
      body: z.string(),
      icon: z.string().optional(),
      data: z.record(z.any()).optional(),
      actionUrl: z.string().optional(),
      channels: z.array(z.enum(["email", "sms", "push", "inapp"])).optional(),
      recipients: z.object({
        email: z.string().optional(),
        sms: z.string().optional(),
        push: z.string().optional(),
        inapp: z.string(),
      }),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const service = initializeMultiChannelService();
    
    const payload = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: parsed.data.userId,
      category: parsed.data.category,
      title: parsed.data.title,
      body: parsed.data.body,
      icon: parsed.data.icon,
      data: parsed.data.data,
      actionUrl: parsed.data.actionUrl,
      timestamp: new Date(),
    };

    const results = await service.sendNotification(
      parsed.data.userId,
      payload,
      parsed.data.recipients,
      parsed.data.channels,
    );

    logger.info("Multi-channel notification sent", {
      userId: parsed.data.userId,
      category: parsed.data.category,
      results: Array.from(results.entries()),
    });

    return res.json({
      notificationId: payload.id,
      results: Array.from(results.entries()),
      message: "Notification sent successfully",
    });
  }),
);

/**
 * GET /api/notifications/delivery-history
 * Get delivery history for user
 */
router.get(
  "/delivery-history",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const { limit } = req.query;
    const service = initializeMultiChannelService();
    
    const history = await service.getDeliveryHistory(
      userId,
      limit ? parseInt(limit as string) : 100,
    );

    return res.json({
      userId,
      history,
      total: history.length,
    });
  }),
);

/**
 * GET /api/notifications/delivery-stats
 * Get delivery statistics for user
 */
router.get(
  "/delivery-stats",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const service = initializeMultiChannelService();
    
    const stats = await service.getStatistics(userId);

    return res.json(stats);
  }),
);

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
  asyncHandler(async (_req: Request, res: Response) => {
    const stats = await pushNotificationService.getSubscriptionStats();

    return res.json(stats);
  }),
);

export default router;
