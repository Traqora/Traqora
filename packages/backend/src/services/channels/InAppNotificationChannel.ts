/**
 * In-App Notification Channel
 * Handles in-app notification delivery and storage
 */

import { logger } from '../../utils/logger';
import type {
  NotificationChannel,
  NotificationPayload,
} from '../../types/notification';
import type { DeliveryChannel, DeliveryResult } from '../MultiChannelNotificationService';

export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: string;
  icon?: string;
  actionUrl?: string;
  data?: Record<string, any>;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

export class InAppNotificationChannel implements DeliveryChannel {
  name: NotificationChannel = 'inapp';
  enabled: boolean = true;
  private notifications: Map<string, InAppNotification[]> = new Map();
  private maxNotificationsPerUser = 100;

  /**
   * Deliver notification via in-app
   */
  async deliver(payload: NotificationPayload, recipient: string): Promise<DeliveryResult> {
    if (!this.enabled) {
      return {
        success: false,
        status: 'failed',
        error: 'In-app channel is disabled',
      };
    }

    try {
      const notification: InAppNotification = {
        id: payload.id || `inapp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        userId: recipient,
        title: payload.title,
        body: payload.body,
        category: payload.category,
        icon: payload.icon,
        actionUrl: payload.actionUrl,
        data: payload.data,
        read: false,
        createdAt: payload.timestamp || new Date(),
        expiresAt: this.calculateExpiry(payload),
      };

      // Store notification
      const userNotifs = this.notifications.get(recipient) || [];
      userNotifs.push(notification);

      // Enforce max notifications limit
      if (userNotifs.length > this.maxNotificationsPerUser) {
        userNotifs.splice(0, userNotifs.length - this.maxNotificationsPerUser);
      }

      this.notifications.set(recipient, userNotifs);

      logger.info('In-app notification delivered', {
        userId: recipient,
        notificationId: notification.id,
      });

      this.emit('notificationCreated', notification);

      return {
        success: true,
        status: 'delivered',
        externalId: notification.id,
        metadata: {
          userId: recipient,
          expiresAt: notification.expiresAt,
        },
      };
    } catch (error) {
      logger.error('In-app delivery failed', {
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
   * Get in-app notifications for user
   */
  getNotifications(userId: string, limit: number = 50): InAppNotification[] {
    const notifs = this.notifications.get(userId) || [];

    // Filter expired notifications
    const validNotifs = notifs.filter(n => !n.expiresAt || n.expiresAt > new Date());

    // Return most recent
    return validNotifs.slice(-limit).reverse();
  }

  /**
   * Mark notification as read
   */
  markAsRead(userId: string, notificationId: string): boolean {
    const notifs = this.notifications.get(userId) || [];
    const notification = notifs.find(n => n.id === notificationId);

    if (notification) {
      notification.read = true;
      notification.readAt = new Date();

      this.emit('notificationRead', notification);
      logger.info('In-app notification marked as read', { userId, notificationId });

      return true;
    }

    return false;
  }

  /**
   * Mark all notifications as read for user
   */
  markAllAsRead(userId: string): number {
    const notifs = this.notifications.get(userId) || [];
    let count = 0;

    for (const notification of notifs) {
      if (!notification.read) {
        notification.read = true;
        notification.readAt = new Date();
        count++;
      }
    }

    if (count > 0) {
      logger.info('All in-app notifications marked as read', { userId, count });
    }

    return count;
  }

  /**
   * Clear all notifications for user
   */
  clearNotifications(userId: string): number {
    const notifs = this.notifications.get(userId) || [];
    const count = notifs.length;

    this.notifications.set(userId, []);

    logger.info('In-app notifications cleared', { userId, count });

    return count;
  }

  /**
   * Delete specific notification
   */
  deleteNotification(userId: string, notificationId: string): boolean {
    const notifs = this.notifications.get(userId) || [];
    const index = notifs.findIndex(n => n.id === notificationId);

    if (index !== -1) {
      notifs.splice(index, 1);
      this.notifications.set(userId, notifs);

      logger.info('In-app notification deleted', { userId, notificationId });

      return true;
    }

    return false;
  }

  /**
   * Get unread count for user
   */
  getUnreadCount(userId: string): number {
    const notifs = this.notifications.get(userId) || [];
    return notifs.filter(n => !n.read && (!n.expiresAt || n.expiresAt > new Date())).length;
  }

  /**
   * Get notification statistics for user
   */
  getStatistics(userId: string): {
    total: number;
    read: number;
    unread: number;
    byCategory: Record<string, number>;
  } {
    const notifs = this.notifications.get(userId) || [];
    const validNotifs = notifs.filter(n => !n.expiresAt || n.expiresAt > new Date());

    const byCategory: Record<string, number> = {};

    for (const notif of validNotifs) {
      byCategory[notif.category] = (byCategory[notif.category] || 0) + 1;
    }

    return {
      total: validNotifs.length,
      read: validNotifs.filter(n => n.read).length,
      unread: validNotifs.filter(n => !n.read).length,
      byCategory,
    };
  }

  /**
   * Calculate expiry time for notification
   */
  private calculateExpiry(payload: NotificationPayload): Date | undefined {
    // Default expiry: 30 days
    const defaultExpiryDays = 30;

    // Category-specific expiry
    const categoryExpiryDays: Record<string, number> = {
      booking: 90,
      payment: 180,
      itinerary: 30,
      collaboration: 60,
      marketing: 7,
      system: 14,
    };

    const expiryDays = categoryExpiryDays[payload.category] || defaultExpiryDays;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    return expiryDate;
  }

  /**
   * Clean up expired notifications for all users
   */
  cleanupExpiredNotifications(): number {
    let totalRemoved = 0;
    const now = new Date();

    for (const [userId, notifs] of this.notifications) {
      const validNotifs = notifs.filter(n => !n.expiresAt || n.expiresAt > now);
      const removed = notifs.length - validNotifs.length;

      if (removed > 0) {
        this.notifications.set(userId, validNotifs);
        totalRemoved += removed;
      }
    }

    if (totalRemoved > 0) {
      logger.info('Expired in-app notifications cleaned up', { totalRemoved });
    }

    return totalRemoved;
  }

  /**
   * Enable/disable channel
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('In-app channel enabled status changed', { enabled });
  }

  /**
   * Update configuration
   */
  updateConfig(config: { maxNotificationsPerUser?: number }): void {
    if (config.maxNotificationsPerUser !== undefined) {
      this.maxNotificationsPerUser = config.maxNotificationsPerUser;
    }
    logger.info('In-app channel configuration updated');
  }

  /**
   * Event emitter for in-app notifications
   */
  private emit(event: string, data: any): void {
    // Simple event emission - in production, use EventEmitter
    logger.debug('In-app notification event', { event, data });
  }
}
