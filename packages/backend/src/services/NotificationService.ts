/**
 * Core Notification Service
 * Orchestrates multi-channel notification delivery based on user preferences
 */

import { logger } from "../utils/logger";
import type {
  NotificationPreference,
  UserNotificationSettings,
  NotificationPayload,
  Notification,
  NotificationChannel,
  NotificationCategory,
  DeliveryStatus,
  DeliveryLog,
  NotificationPreferenceUpdate,
} from "../types/notification";

export class NotificationService {
  private static _instance: NotificationService;

  public static getInstance(): NotificationService {
    if (!NotificationService._instance) {
      NotificationService._instance = new NotificationService();
    }
    return NotificationService._instance;
  }

  private preferences: Map<string, NotificationPreference[]> = new Map();
  private settings: Map<string, UserNotificationSettings> = new Map();
  private notifications: Map<string, Notification[]> = new Map();
  private deliveryLogs: Map<string, DeliveryLog[]> = new Map();

  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    logger.info('Sending email', { to, subject, bodyLength: body.length });
    return true;
  }

  /**
   * Get or create user notification settings
   */
  async getUserSettings(userId: string): Promise<UserNotificationSettings> {
    const cached = this.settings.get(userId);
    if (cached) return cached;

    const settings: UserNotificationSettings = {
      userId,
      emailAddress: `user${userId}@example.com`,
      preferences: await this.getPreferences(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.settings.set(userId, settings);
    return settings;
  }

  /**
   * Get user preferences for a channel
   */
  async getPreferences(
    userId: string,
    channel?: NotificationChannel,
    category?: NotificationCategory,
  ): Promise<NotificationPreference[]> {
    const prefs = this.preferences.get(userId) || [];

    return prefs.filter((p) => {
      if (channel && p.channel !== channel) return false;
      if (category && p.category !== category) return false;
      return true;
    });
  }

  /**
   * Update notification preference
   */
  async updatePreference(
    userId: string,
    update: NotificationPreferenceUpdate,
  ): Promise<NotificationPreference> {
    let prefs = this.preferences.get(userId) || [];

    // Find or create preference
    let pref = prefs.find(
      (p) => p.channel === update.channel && p.category === update.category,
    );

    if (!pref) {
      pref = {
        id: `pref-${Date.now()}-${Math.random()}`,
        userId,
        channel: update.channel,
        category: update.category,
        frequency: update.frequency,
        enabled: update.enabled,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prefs.push(pref);
    } else {
      pref.frequency = update.frequency;
      pref.enabled = update.enabled;
      pref.updatedAt = new Date();
    }

    this.preferences.set(userId, prefs);
    logger.info("Preference updated", {
      userId,
      channel: update.channel,
      category: update.category,
    });

    return pref;
  }

  /**
   * Check if notification should be delivered via channel
   */
  async shouldDeliver(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId, channel, category);

    if (prefs.length === 0) {
      // Default to enabled if no preference set
      return true;
    }

    const pref = prefs[0];
    return pref.enabled && pref.frequency !== "never";
  }

  /**
   * Queue notification for delivery
   */
  async queueNotification(
    userId: string,
    payload: NotificationPayload,
    channels: NotificationChannel[],
  ): Promise<Notification> {
    const notification: Notification = {
      id: payload.id,
      userId,
      category: payload.category,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      actionUrl: payload.actionUrl,
      read: false,
      deliveries: [],
      createdAt: new Date(),
    };

    // Check preferences and prepare deliveries
    for (const channel of channels) {
      const shouldDeliver = await this.shouldDeliver(
        userId,
        channel,
        payload.category,
      );

      if (shouldDeliver) {
        notification.deliveries.push({
          channel,
          status: "pending",
          retryCount: 0,
        });
      }
    }

    // Store notification
    const userNotifs = this.notifications.get(userId) || [];
    userNotifs.push(notification);
    this.notifications.set(userId, userNotifs);

    logger.info("Notification queued", {
      userId,
      category: payload.category,
      channels: notification.deliveries.map((d) => d.channel),
    });

    return notification;
  }

  /**
   * Get in-app notifications for user
   */
  async getInAppNotifications(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    const notifs = this.notifications.get(userId) || [];

    return notifs
      .filter((n) => !n.expiresAt || n.expiresAt > new Date())
      .slice(-limit);
  }

  /**
   * Mark notification as read
   */
  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const notifs = this.notifications.get(userId) || [];
    const notif = notifs.find((n) => n.id === notificationId);

    if (notif) {
      notif.read = true;
      notif.readAt = new Date();
    }

    logger.info("Notification marked as read", { userId, notificationId });
  }

  /**
   * Clear all notifications
   */
  async clearNotifications(userId: string): Promise<number> {
    const notifs = this.notifications.get(userId) || [];
    const count = notifs.length;

    this.notifications.set(userId, []);

    logger.info("Notifications cleared", { userId, count });

    return count;
  }

  /**
   * Log delivery attempt
   */
  async logDelivery(
    notificationId: string,
    userId: string,
    channel: NotificationChannel,
    status: DeliveryStatus,
    message?: string,
  ): Promise<DeliveryLog> {
    const log: DeliveryLog = {
      id: `log-${Date.now()}-${Math.random()}`,
      notificationId,
      userId,
      channel,
      status,
      message,
      timestamp: new Date(),
    };

    const logs = this.deliveryLogs.get(userId) || [];
    logs.push(log);
    this.deliveryLogs.set(userId, logs);

    return log;
  }

  /**
   * Get delivery logs
   */
  async getDeliveryLogs(
    userId: string,
    limit: number = 100,
  ): Promise<DeliveryLog[]> {
    const logs = this.deliveryLogs.get(userId) || [];
    return logs.slice(-limit);
  }

  /**
   * Get notification statistics
   */
  async getStatistics(userId: string): Promise<{
    total: number;
    read: number;
    unread: number;
    byCategory: Record<NotificationCategory, number>;
  }> {
    const notifs = this.notifications.get(userId) || [];

    return {
      total: notifs.length,
      read: notifs.filter((n) => n.read).length,
      unread: notifs.filter((n) => !n.read).length,
      byCategory: notifs.reduce(
        (acc, n) => {
          acc[n.category] = (acc[n.category] || 0) + 1;
          return acc;
        },
        {} as Record<NotificationCategory, number>,
      ),
    };
  }

  /**
   * Update delivery status
   */
  async updateDeliveryStatus(
    userId: string,
    notificationId: string,
    channel: NotificationChannel,
    status: DeliveryStatus,
  ): Promise<void> {
    const notifs = this.notifications.get(userId) || [];
    const notif = notifs.find((n) => n.id === notificationId);

    if (notif) {
      const delivery = notif.deliveries.find((d) => d.channel === channel);
      if (delivery) {
        delivery.status = status;
        if (status === "delivered") {
          delivery.deliveredAt = new Date();
        } else if (status === "sent") {
          delivery.sentAt = new Date();
        }
      }
    }

    await this.logDelivery(notificationId, userId, channel, status);
  }

  /**
   * Get failed deliveries for retry
   */
  async getFailedDeliveries(
    maxAge: number = 3600000,
  ): Promise<
    Array<{
      userId: string;
      notificationId: string;
      channel: NotificationChannel;
    }>
  > {
    const failed: Array<{
      userId: string;
      notificationId: string;
      channel: NotificationChannel;
    }> = [];
    const now = Date.now();

    for (const [userId, notifs] of this.notifications) {
      for (const notif of notifs) {
        for (const delivery of notif.deliveries) {
          if (delivery.status === "failed" && delivery.retryCount < 3) {
            const age = now - notif.createdAt.getTime();
            if (age < maxAge) {
              failed.push({
                userId,
                notificationId: notif.id,
                channel: delivery.channel,
              });
            }
          }
        }
      }
    }

    return failed;
  }
}

export const notificationService = new NotificationService();
