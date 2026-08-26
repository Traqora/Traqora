/**
 * Push Notification Service
 * Handles web push and mobile push notifications
 */

import { logger } from "../utils/logger";
import type { PushSubscription } from "../types/notification";

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
   * Send push notification
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

    const payload = JSON.stringify({
      title,
      options,
    });

    let successful = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      try {
        // In production, integrate with Firebase Cloud Messaging, OneSignal, or similar
        // For now, we'll simulate the send
        await this.simulateSend(sub, payload);
        successful++;

        sub.lastUsedAt = new Date();
      } catch (error) {
        failed++;

        logger.error("Failed to send push", {
          userId,
          endpoint: sub.endpoint.substring(0, 50),
          error,
        });

        // Mark subscription as inactive if endpoint is dead
        if (error instanceof Error && error.message.includes("410")) {
          sub.isActive = false;
        }
      }
    }

    logger.info("Push notifications sent", { userId, successful, failed });

    return { successful, failed };
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
      // In production, test the subscription with a minimal payload
      const testPayload = JSON.stringify({ test: true });
      await this.simulateSend(sub, testPayload);
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
   * Get subscription count by user
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
   * Helper: Simulate push send (replace with actual provider integration)
   */
  private async simulateSend(
    _sub: PushSubscription,
    _payload: string,
  ): Promise<void> {
    // Simulate network call
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate occasional failures
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
