/**
 * Push Notification Channel
 * Handles push notification delivery via Web Push API
 */

import { logger } from '../../utils/logger';
import type {
  NotificationChannel,
  NotificationPayload,
} from '../../types/notification';
import type { DeliveryChannel, DeliveryResult } from '../MultiChannelNotificationService';

export interface PushConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  subject: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}

export class PushNotificationChannel implements DeliveryChannel {
  name: NotificationChannel = 'push';
  enabled: boolean = true;
  private config: PushConfig;
  private subscriptions: Map<string, PushSubscription[]> = new Map();

  constructor(config: PushConfig) {
    this.config = config;
  }

  /**
   * Add subscription for a user
   */
  addSubscription(userId: string, subscription: PushSubscription): void {
    const userSubs = this.subscriptions.get(userId) || [];
    
    // Check if subscription already exists
    const exists = userSubs.some(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
      userSubs.push(subscription);
      this.subscriptions.set(userId, userSubs);
      logger.info('Push subscription added', { userId, endpoint: subscription.endpoint });
    }
  }

  /**
   * Remove subscription for a user
   */
  removeSubscription(userId: string, endpoint: string): void {
    const userSubs = this.subscriptions.get(userId) || [];
    const filtered = userSubs.filter(sub => sub.endpoint !== endpoint);
    this.subscriptions.set(userId, filtered);
    logger.info('Push subscription removed', { userId, endpoint });
  }

  /**
   * Get subscriptions for a user
   */
  getSubscriptions(userId: string): PushSubscription[] {
    return this.subscriptions.get(userId) || [];
  }

  /**
   * Deliver notification via push
   */
  async deliver(payload: NotificationPayload, recipient: string): Promise<DeliveryResult> {
    if (!this.enabled) {
      return {
        success: false,
        status: 'failed',
        error: 'Push channel is disabled',
      };
    }

    try {
      const subscriptions = this.getSubscriptions(recipient);

      if (subscriptions.length === 0) {
        return {
          success: false,
          status: 'bounced',
          error: 'No push subscriptions found for user',
        };
      }

      const results = await Promise.all(
        subscriptions.map(sub => this.sendPushNotification(sub, payload))
      );

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      logger.info('Push notification sent', {
        recipient,
        total: results.length,
        successful,
        failed,
      });

      return {
        success: successful > 0,
        status: successful === results.length ? 'delivered' : failed === results.length ? 'failed' : 'delivered',
        metadata: {
          total: results.length,
          successful,
          failed,
        },
      };
    } catch (error) {
      logger.error('Push delivery failed', {
        recipient,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send push notification to a single subscription
   */
  private async sendPushNotification(
    subscription: PushSubscription,
    _payload: NotificationPayload
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Placeholder for Web Push implementation
      // In production, use the web-push npm package
      logger.info('Web push send called', { endpoint: subscription.endpoint });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Enable/disable channel
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Push channel enabled status changed', { enabled });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PushConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Push channel configuration updated');
  }

  /**
   * Get subscription statistics
   */
  getStatistics(): {
    totalUsers: number;
    totalSubscriptions: number;
  } {
    let totalSubscriptions = 0;
    for (const subs of this.subscriptions.values()) {
      totalSubscriptions += subs.length;
    }

    return {
      totalUsers: this.subscriptions.size,
      totalSubscriptions,
    };
  }
}
