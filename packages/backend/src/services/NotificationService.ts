/**
 * Core Notification Service
 * Orchestrates multi-channel notification delivery based on user preferences
 */

import { logger } from "../utils/logger";
import { emailService } from "./EmailService";
import { smsService } from "./SMSService";
import { pushNotificationService } from "./PushNotificationService";
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

/** Maximum per-delivery retry attempts before giving up */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay (ms) for exponential back-off: 30 s, 60 s, 120 s */
const RETRY_BASE_DELAY_MS = 30_000;

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

  // -------------------------------------------------------------------------
  // User settings & preferences
  // -------------------------------------------------------------------------

  /**
   * Get or create user notification settings.
   * The caller should update `emailAddress` / `phoneNumber` via `updateUserSettings`
   * once their profile data is available.
   */
  async getUserSettings(userId: string): Promise<UserNotificationSettings> {
    const cached = this.settings.get(userId);
    if (cached) return cached;

    const settings: UserNotificationSettings = {
      userId,
      emailAddress: "",
      preferences: await this.getPreferences(userId),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.settings.set(userId, settings);
    return settings;
  }

  /**
   * Update mutable fields of a user's notification settings (email, phone, DND).
   */
  async updateUserSettings(
    userId: string,
    patch: Partial<
      Pick<
        UserNotificationSettings,
        "emailAddress" | "phoneNumber" | "doNotDisturb" | "unsubscribeToken"
      >
    >,
  ): Promise<UserNotificationSettings> {
    const settings = await this.getUserSettings(userId);
    Object.assign(settings, patch, { updatedAt: new Date() });
    this.settings.set(userId, settings);
    logger.info("User notification settings updated", { userId });
    return settings;
  }

  /**
   * Get user preferences, optionally filtered by channel and/or category.
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
   * Upsert a single notification preference.
   */
  async updatePreference(
    userId: string,
    update: NotificationPreferenceUpdate,
  ): Promise<NotificationPreference> {
    const prefs = this.preferences.get(userId) || [];

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

  // -------------------------------------------------------------------------
  // Delivery gating
  // -------------------------------------------------------------------------

  /**
   * Returns true when a notification should be delivered on the given channel.
   * Checks:
   *   1. Per-channel / per-category preference (enabled + frequency != "never")
   *   2. Do-Not-Disturb window (skips non-system channels during quiet hours)
   */
  async shouldDeliver(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): Promise<boolean> {
    const prefs = await this.getPreferences(userId, channel, category);

    if (prefs.length > 0) {
      const pref = prefs[0];
      if (!pref.enabled || pref.frequency === "never") return false;
    }
    // Default: enabled if no preference stored yet

    // System notifications bypass Do-Not-Disturb
    if (category === "system") return true;

    return !this.isDoNotDisturbActive(userId);
  }

  /**
   * Check whether the current time falls inside the user's DND window.
   */
  private isDoNotDisturbActive(userId: string): boolean {
    const settings = this.settings.get(userId);
    if (!settings?.doNotDisturb?.enabled) return false;

    const { startTime, endTime, timezone } = settings.doNotDisturb;

    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hour = parseInt(parts.find((p) => p.type === "hour")!.value, 10);
      const minute = parseInt(
        parts.find((p) => p.type === "minute")!.value,
        10,
      );
      const currentMinutes = hour * 60 + minute;

      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = endTime.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes <= endMinutes) {
        // Same-day window e.g. 09:00–18:00
        return currentMinutes >= startMinutes && currentMinutes < endMinutes;
      } else {
        // Overnight window e.g. 22:00–08:00
        return currentMinutes >= startMinutes || currentMinutes < endMinutes;
      }
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Notification queuing & dispatch
  // -------------------------------------------------------------------------

  /**
   * Queue a notification for the user and immediately dispatch to all
   * enabled channels (email, sms, push, inapp).
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

    for (const channel of channels) {
      const gate = await this.shouldDeliver(userId, channel, payload.category);
      if (gate) {
        notification.deliveries.push({
          channel,
          status: "pending",
          retryCount: 0,
        });
      }
    }

    const userNotifs = this.notifications.get(userId) || [];
    userNotifs.push(notification);
    this.notifications.set(userId, userNotifs);

    logger.info("Notification queued", {
      userId,
      category: payload.category,
      channels: notification.deliveries.map((d) => d.channel),
    });

    // Fire-and-forget dispatch for non-inapp channels
    this.dispatchNotification(notification, payload).catch((err) => {
      logger.error("Dispatch error", { notificationId: notification.id, err });
    });

    return notification;
  }

  /**
   * Dispatch a notification to all pending delivery channels.
   * inapp delivery is always treated as immediately delivered (stored in memory).
   */
  private async dispatchNotification(
    notification: Notification,
    payload: NotificationPayload,
  ): Promise<void> {
    const settings = await this.getUserSettings(notification.userId);

    for (const delivery of notification.deliveries) {
      if (delivery.status !== "pending") continue;

      try {
        await this.deliverOnChannel(
          notification,
          payload,
          delivery.channel,
          settings,
        );
        delivery.status = "sent";
        delivery.sentAt = new Date();
        await this.logDelivery(
          notification.id,
          notification.userId,
          delivery.channel,
          "sent",
        );
      } catch (err) {
        delivery.status = "failed";
        delivery.retryCount += 1;
        delivery.nextRetryAt = new Date(
          Date.now() + RETRY_BASE_DELAY_MS * delivery.retryCount,
        );
        const errMsg = err instanceof Error ? err.message : String(err);
        await this.logDelivery(
          notification.id,
          notification.userId,
          delivery.channel,
          "failed",
          errMsg,
        );
        logger.error("Channel delivery failed", {
          notificationId: notification.id,
          channel: delivery.channel,
          error: errMsg,
        });
      }
    }
  }

  /**
   * Deliver on a single channel by calling the appropriate sub-service.
   */
  private async deliverOnChannel(
    notification: Notification,
    payload: NotificationPayload,
    channel: NotificationChannel,
    settings: UserNotificationSettings,
  ): Promise<void> {
    switch (channel) {
      case "inapp":
        // Already stored in memory — nothing extra to do
        break;

      case "email": {
        if (!settings.emailAddress) {
          throw new Error("No email address configured for user");
        }
        const sent = await emailService.send({
          to: settings.emailAddress,
          subject: notification.title,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2>${notification.title}</h2>
            <p>${notification.body}</p>
            ${notification.actionUrl ? `<p><a href="${notification.actionUrl}" style="background:#0066cc;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">View Details</a></p>` : ""}
          </div>`,
          text: notification.body,
        });
        if (!sent) throw new Error("Email delivery returned false");
        break;
      }

      case "sms": {
        if (!settings.phoneNumber) {
          throw new Error("No phone number configured for user");
        }
        const delivery = await smsService.sendSMS(
          settings.phoneNumber,
          `${notification.title}: ${notification.body}`,
          notification.userId,
        );
        if (delivery.status === "failed") {
          throw new Error(delivery.failureReason ?? "SMS delivery failed");
        }
        break;
      }

      case "push": {
        const result = await pushNotificationService.sendPush(
          notification.userId,
          notification.title,
          {
            body: notification.body,
            tag: notification.category,
            data: payload.data as Record<string, string> | undefined,
          },
        );
        if (result.successful === 0 && result.failed > 0) {
          throw new Error("All push deliveries failed");
        }
        break;
      }

      default: {
        const _exhaustive: never = channel;
        throw new Error(`Unknown delivery channel: ${_exhaustive}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Retry logic
  // -------------------------------------------------------------------------

  /**
   * Retry all failed deliveries whose nextRetryAt is in the past.
   * Intended to be called by a cron/job every minute.
   */
  async retryFailedDeliveries(): Promise<{
    retried: number;
    succeeded: number;
    abandoned: number;
  }> {
    const now = new Date();
    let retried = 0;
    let succeeded = 0;
    let abandoned = 0;

    for (const [userId, notifs] of this.notifications) {
      const settings = await this.getUserSettings(userId);

      for (const notif of notifs) {
        for (const delivery of notif.deliveries) {
          if (delivery.status !== "failed") continue;
          if (delivery.retryCount >= MAX_RETRY_ATTEMPTS) {
            abandoned++;
            continue;
          }
          if (delivery.nextRetryAt && delivery.nextRetryAt > now) continue;

          retried++;
          try {
            const payload: NotificationPayload = {
              id: notif.id,
              userId,
              category: notif.category,
              title: notif.title,
              body: notif.body,
              data: notif.data,
              actionUrl: notif.actionUrl,
              timestamp: notif.createdAt,
            };
            await this.deliverOnChannel(
              notif,
              payload,
              delivery.channel,
              settings,
            );
            delivery.status = "sent";
            delivery.sentAt = new Date();
            delivery.nextRetryAt = undefined;
            succeeded++;
            await this.logDelivery(
              notif.id,
              userId,
              delivery.channel,
              "sent",
              "Retry succeeded",
            );
          } catch (err) {
            delivery.retryCount += 1;
            delivery.nextRetryAt = new Date(
              now.getTime() + RETRY_BASE_DELAY_MS * delivery.retryCount,
            );
            const errMsg = err instanceof Error ? err.message : String(err);
            await this.logDelivery(
              notif.id,
              userId,
              delivery.channel,
              "failed",
              `Retry ${delivery.retryCount} failed: ${errMsg}`,
            );
          }
        }
      }
    }

    logger.info("Retry run complete", { retried, succeeded, abandoned });
    return { retried, succeeded, abandoned };
  }

  /**
   * Get failed deliveries eligible for retry (retryCount < MAX, within maxAge).
   */
  async getFailedDeliveries(
    maxAge: number = 3_600_000,
  ): Promise<
    Array<{
      userId: string;
      notificationId: string;
      channel: NotificationChannel;
      retryCount: number;
    }>
  > {
    const failed: Array<{
      userId: string;
      notificationId: string;
      channel: NotificationChannel;
      retryCount: number;
    }> = [];
    const now = Date.now();

    for (const [userId, notifs] of this.notifications) {
      for (const notif of notifs) {
        for (const delivery of notif.deliveries) {
          if (
            delivery.status === "failed" &&
            delivery.retryCount < MAX_RETRY_ATTEMPTS
          ) {
            const age = now - notif.createdAt.getTime();
            if (age < maxAge) {
              failed.push({
                userId,
                notificationId: notif.id,
                channel: delivery.channel,
                retryCount: delivery.retryCount,
              });
            }
          }
        }
      }
    }

    return failed;
  }

  // -------------------------------------------------------------------------
  // Flight status alert integration
  // -------------------------------------------------------------------------

  /**
   * Send a flight status alert to a user across all channels they have enabled.
   * Called by flightStatusNotifier.ts.
   */
  async sendFlightStatusAlert(
    userId: string,
    flightId: string,
    status: string,
    details: {
      gate?: string;
      delayMinutes?: number;
      reason?: string;
    },
  ): Promise<boolean> {
    const { gate, delayMinutes, reason } = details;

    let category: NotificationCategory = "itinerary";
    let title: string;
    let body: string;

    if (status === "cancelled") {
      title = `Flight ${flightId} Cancelled`;
      body = `Your flight ${flightId} has been cancelled.${reason ? ` Reason: ${reason}.` : ""} A refund will be processed automatically.`;
    } else if (status === "delayed" && delayMinutes) {
      title = `Flight ${flightId} Delayed`;
      body = `Your flight ${flightId} is delayed by ${delayMinutes} minute${delayMinutes !== 1 ? "s" : ""}.${gate ? ` Departure gate: ${gate}.` : ""}`;
    } else if (gate) {
      title = `Gate Change: Flight ${flightId}`;
      body = `The departure gate for flight ${flightId} has changed to ${gate}.`;
    } else {
      title = `Flight ${flightId} Update`;
      body = `Your flight ${flightId} status is now: ${status}.`;
    }

    const payload: NotificationPayload = {
      id: `flight-alert-${flightId}-${Date.now()}`,
      userId,
      category,
      title,
      body,
      data: {
        flightId,
        status,
        ...(gate && { gate }),
        ...(delayMinutes !== undefined && {
          delayMinutes: String(delayMinutes),
        }),
        ...(reason && { reason }),
      },
      timestamp: new Date(),
    };

    try {
      await this.queueNotification(userId, payload, [
        "inapp",
        "email",
        "sms",
        "push",
      ]);
      return true;
    } catch (err) {
      logger.error("sendFlightStatusAlert failed", { userId, flightId, err });
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // In-app inbox
  // -------------------------------------------------------------------------

  async getInAppNotifications(
    userId: string,
    limit: number = 50,
  ): Promise<Notification[]> {
    const notifs = this.notifications.get(userId) || [];
    return notifs
      .filter((n) => !n.expiresAt || n.expiresAt > new Date())
      .slice(-limit)
      .reverse(); // newest first
  }

  async markAsRead(userId: string, notificationId: string): Promise<void> {
    const notifs = this.notifications.get(userId) || [];
    const notif = notifs.find((n) => n.id === notificationId);
    if (notif) {
      notif.read = true;
      notif.readAt = new Date();
    }
    logger.info("Notification marked as read", { userId, notificationId });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const notifs = this.notifications.get(userId) || [];
    let count = 0;
    for (const n of notifs) {
      if (!n.read) {
        n.read = true;
        n.readAt = new Date();
        count++;
      }
    }
    logger.info("All notifications marked as read", { userId, count });
    return count;
  }

  async clearNotifications(userId: string): Promise<number> {
    const notifs = this.notifications.get(userId) || [];
    const count = notifs.length;
    this.notifications.set(userId, []);
    logger.info("Notifications cleared", { userId, count });
    return count;
  }

  // -------------------------------------------------------------------------
  // Delivery logging
  // -------------------------------------------------------------------------

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

  async getDeliveryLogs(
    userId: string,
    limit: number = 100,
  ): Promise<DeliveryLog[]> {
    const logs = this.deliveryLogs.get(userId) || [];
    return logs.slice(-limit);
  }

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
        if (status === "delivered") delivery.deliveredAt = new Date();
        else if (status === "sent") delivery.sentAt = new Date();
      }
    }

    await this.logDelivery(notificationId, userId, channel, status);
  }

  // -------------------------------------------------------------------------
  // Legacy compatibility
  // -------------------------------------------------------------------------

  /** @deprecated Use emailService.send() directly or queueNotification() */
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    logger.warn("NotificationService.sendEmail is deprecated", {
      to,
      subject,
    });
    return emailService.send({ to, subject, html: body });
  }

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

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
}

export const notificationService = new NotificationService();
