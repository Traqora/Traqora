/**
 * Push Notification Service
 * Handles web push and mobile push notifications
 */

import { logger } from "../utils/logger";
import type { PushSubscription } from "../types/notification";

export type PushNotificationType =
  | "booking"
  | "reminder"
  | "refund"
  | "flight_delayed"
  | "flight_delayed_significant"
  | "flight_cancelled"
  | "gate_changed"
  | "boarding_reminder"
  | "flight_status"
  | "refund_initiated"
  | "payment"
  | "marketing"
  | "system";

export interface TypedPushData {
  flightNumber?: string;
  bookingReference?: string;
  refundAmount?: string;
  from?: string;
  to?: string;
  delayMinutes?: number;
  cancellationReason?: string;
  previousGate?: string;
  newGate?: string;
  gate?: string;
  terminal?: string;
  status?: string;
  [key: string]: string | number | undefined;
}

export class PushNotificationService {
  private subscriptions: Map<string, PushSubscription[]> = new Map();

  /**
   * Subscribe user device to push notifications
   */
  async subscribe(
    userId: string,
    subscription: {
      endpoint: string;
      auth: string;
      p256dh: string;
      userAgent: string;
    },
  ): Promise<PushSubscription> {
    // Check for duplicate subscription
    const userSubs = this.subscriptions.get(userId) || [];
    const existing = userSubs.find((s) => s.endpoint === subscription.endpoint);

    if (existing) {
      existing.isActive = true;
      existing.lastUsedAt = new Date();
      return existing;
    }

    const pushSub: PushSubscription = {
      id: `pushsub-${Date.now()}-${Math.random()}`,
      userId,
      endpoint: subscription.endpoint,
      auth: subscription.auth,
      p256dh: subscription.p256dh,
      userAgent: subscription.userAgent,
      isActive: true,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    userSubs.push(pushSub);
    this.subscriptions.set(userId, userSubs);

    logger.info("Push subscription created", {
      userId,
      endpoint: subscription.endpoint.substring(0, 50),
    });

    return pushSub;
  }

  /**
   * Unsubscribe user device from push
   */
  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    const subs = this.subscriptions.get(userId) || [];
    const sub = subs.find((s) => s.endpoint === endpoint);

    if (sub) {
      sub.isActive = false;
    }

    logger.info("Push subscription removed", { userId });
  }

  /**
   * Get user subscriptions
   */
  async getSubscriptions(userId: string): Promise<PushSubscription[]> {
    return (this.subscriptions.get(userId) || []).filter((s) => s.isActive);
  }

  /**
   * Send push notification with explicit title/options
   */
  async sendPush(
    userId: string,
    title: string,
    options: {
      body?: string;
      icon?: string;
      badge?: string;
      tag?: string;
      data?: Record<string, string>;
      actions?: Array<{ action: string; title: string; icon?: string }>;
      requireInteraction?: boolean;
    },
  ): Promise<{ successful: number; failed: number }> {
    const subscriptions = await this.getSubscriptions(userId);

    if (subscriptions.length === 0) {
      logger.warn("No push subscriptions found", { userId });
      return { successful: 0, failed: 0 };
    }

    const payload = JSON.stringify({ title, options });

    let successful = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        await this.deliverToSubscription(sub, payload);
        successful++;
        sub.lastUsedAt = new Date();
      } catch (error) {
        failed++;

        logger.error("Failed to send push", {
          userId,
          endpoint: sub.endpoint.substring(0, 50),
          error,
        });

        // Mark subscription as inactive if endpoint is permanently gone
        if (error instanceof Error && error.message.includes("410")) {
          sub.isActive = false;
        }
      }
    }

    logger.info("Push notifications sent", { userId, successful, failed });

    return { successful, failed };
  }

  /**
   * Send a typed push notification using a pre-defined template
   */
  async sendTypedPush(
    userId: string,
    type: PushNotificationType,
    data: TypedPushData,
  ): Promise<{ successful: number; failed: number }> {
    const { title, body } = this.buildTypedMessage(type, data);

    return this.sendPush(userId, title, {
      body,
      tag: type,
      data: Object.fromEntries(
        Object.entries(data)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      ) as Record<string, string>,
    });
  }

  /**
   * Send push to multiple users
   */
  async broadcastPush(
    title: string,
    options: {
      body?: string;
      icon?: string;
      data?: Record<string, string>;
    },
    userIds: string[],
  ): Promise<{ totalSent: number; totalFailed: number }> {
    let totalSent = 0;
    let totalFailed = 0;

    for (const userId of userIds) {
      const result = await this.sendPush(userId, title, options);
      totalSent += result.successful;
      totalFailed += result.failed;
    }

    logger.info("Broadcast push completed", {
      totalSent,
      totalFailed,
      users: userIds.length,
    });

    return { totalSent, totalFailed };
  }

  /**
   * Validate push subscription
   */
  async validateSubscription(sub: PushSubscription): Promise<boolean> {
    try {
      const testPayload = JSON.stringify({ test: true });
      await this.deliverToSubscription(sub, testPayload);
      return true;
    } catch (error) {
      logger.warn("Push subscription validation failed", {
        endpoint: sub.endpoint.substring(0, 50),
      });
      return false;
    }
  }

  /**
   * Clean up inactive subscriptions
   */
  async cleanupInactiveSubscriptions(
    maxAge: number = 30 * 24 * 60 * 60 * 1000,
  ): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [userId, subs] of this.subscriptions) {
      const active = subs.filter((s) => {
        if (!s.lastUsedAt) return true;
        const age = now - s.lastUsedAt.getTime();
        if (age > maxAge) {
          cleaned++;
          return false;
        }
        return true;
      });

      this.subscriptions.set(userId, active);
    }

    logger.info("Inactive push subscriptions cleaned up", { count: cleaned });

    return cleaned;
  }

  /**
   * Get subscription statistics
   */
  async getSubscriptionStats(): Promise<{
    totalUsers: number;
    totalSubscriptions: number;
    activeSubscriptions: number;
  }> {
    let totalSubs = 0;
    let activeSubs = 0;

    for (const subs of this.subscriptions.values()) {
      totalSubs += subs.length;
      activeSubs += subs.filter((s) => s.isActive).length;
    }

    return {
      totalUsers: this.subscriptions.size,
      totalSubscriptions: totalSubs,
      activeSubscriptions: activeSubs,
    };
  }

  /**
   * Build title/body strings for typed push notifications
   */
  private buildTypedMessage(
    type: PushNotificationType,
    data: TypedPushData,
  ): { title: string; body: string } {
    switch (type) {
      case "booking":
        return {
          title: "Booking Confirmed",
          body: `Your flight ${data.flightNumber} is confirmed! Ref: ${data.bookingReference}`,
        };
      case "reminder":
        return {
          title: "Flight Reminder",
          body: `Your flight ${data.flightNumber} departs in 24 hours!`,
        };
      case "refund":
        return {
          title: "Refund Processed",
          body: `Refund of ${data.refundAmount} for booking ${data.bookingReference} is processed.`,
        };
      case "flight_delayed":
        return {
          title: `Flight ${data.flightNumber} Delayed`,
          body: `Your flight ${data.flightNumber} (${data.from ?? ""} → ${data.to ?? ""}) is delayed by ${data.delayMinutes} minutes.`,
        };
      case "flight_delayed_significant":
        return {
          title: `\u26a0\ufe0f Significant Delay: ${data.flightNumber}`,
          body: `Your flight ${data.flightNumber} (${data.from ?? ""} → ${data.to ?? ""}) is delayed by ${data.delayMinutes} minutes. Please check the app for updated information.`,
        };
      case "flight_cancelled":
        return {
          title: `\u274c Flight ${data.flightNumber} Cancelled`,
          body: `Your flight ${data.flightNumber} (${data.from ?? ""} → ${data.to ?? ""}) has been cancelled. Reason: ${data.cancellationReason ?? "Unknown"}. A refund is being initiated automatically.`,
        };
      case "gate_changed":
        return {
          title: `Gate Change: ${data.flightNumber}`,
          body: `Your flight ${data.flightNumber} gate has changed from ${data.previousGate ?? "N/A"} to ${data.newGate ?? "N/A"}.`,
        };
      case "boarding_reminder":
        return {
          title: `\ud83d\udd14 Boarding Soon: ${data.flightNumber}`,
          body: `Boarding for ${data.flightNumber} begins in 45 minutes at gate ${data.gate ?? "TBD"}, terminal ${data.terminal ?? "TBD"}.`,
        };
      case "flight_status":
        return {
          title: `Flight ${data.flightNumber} Update`,
          body: `Your flight ${data.flightNumber} (${data.from ?? ""} → ${data.to ?? ""}) status: ${data.status}`,
        };
      case "refund_initiated":
        return {
          title: "\ud83d\udd04 Automatic Refund Initiated",
          body: `A refund for cancelled flight ${data.flightNumber} has been initiated. Refund will be processed to your original payment method.`,
        };
      case "payment":
        return {
          title: "Payment Update",
          body: `A payment update is available for booking ${data.bookingReference}.`,
        };
      case "marketing":
        return {
          title: "Special Offer",
          body: "Check out the latest deals for your next trip!",
        };
      case "system":
        return {
          title: "System Notification",
          body: "A system notification requires your attention.",
        };
      default: {
        // exhaustive check
        const _exhaustive: never = type;
        throw new Error(`Unknown push notification type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Deliver payload to a single subscription.
   * In production, replace simulateSend with Firebase Admin SDK or web-push.
   */
  private async deliverToSubscription(
    sub: PushSubscription,
    payload: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate occasional dead endpoints (5 % failure rate)
        if (Math.random() > 0.95) {
          reject(new Error("410 Gone - subscription invalid"));
        } else {
          resolve();
        }
      }, 10);
    });
  }
}

export const pushNotificationService = new PushNotificationService();
