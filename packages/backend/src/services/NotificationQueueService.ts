/**
 * Notification Queue Service
 * Manages notification queue with retry logic and priority handling
 */

import { logger } from '../utils/logger';
import type {
  NotificationPayload,
  NotificationChannel,
} from '../types/notification';
import type { DeliveryChannel, DeliveryResult } from './MultiChannelNotificationService';

export interface QueuedNotification {
  id: string;
  userId: string;
  payload: NotificationPayload;
  recipients: Record<NotificationChannel, string>;
  channels: NotificationChannel[];
  priority: 'low' | 'normal' | 'high' | 'urgent';
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  createdAt: Date;
  scheduledFor?: Date;
}

export interface QueueConfig {
  maxRetries: number;
  retryDelay: number;
  retryBackoffMultiplier: number;
  maxQueueSize: number;
  processingInterval: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  maxRetries: 3,
  retryDelay: 5000,
  retryBackoffMultiplier: 2,
  maxQueueSize: 10000,
  processingInterval: 1000,
};

export class NotificationQueueService {
  private config: QueueConfig;
  private queue: Map<string, QueuedNotification> = new Map();
  private processing: boolean = false;
  private deliveryChannel: DeliveryChannel;
  private priorityWeights: Record<string, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  constructor(
    deliveryChannel: DeliveryChannel,
    config?: Partial<QueueConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deliveryChannel = deliveryChannel;
    this.startProcessing();
  }

  /**
   * Enqueue notification
   */
  enqueue(
    userId: string,
    payload: NotificationPayload,
    recipients: Record<NotificationChannel, string>,
    channels: NotificationChannel[],
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    scheduledFor?: Date,
  ): string {
    const id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const queued: QueuedNotification = {
      id,
      userId,
      payload,
      recipients,
      channels,
      priority,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      createdAt: new Date(),
      scheduledFor,
    };

    // Check queue size limit
    if (this.queue.size >= this.config.maxQueueSize) {
      logger.warn('Notification queue full, dropping oldest notification');
      const oldest = this.getOldestNotification();
      if (oldest) {
        this.queue.delete(oldest.id);
        logger.warn('Notification dropped due to queue full', { id: oldest.id });
      }
    }

    this.queue.set(id, queued);
    logger.info('Notification enqueued', {
      id,
      userId,
      priority,
      scheduledFor,
      queueSize: this.queue.size,
    });

    return id;
  }

  /**
   * Dequeue notification
   */
  dequeue(id: string): boolean {
    const deleted = this.queue.delete(id);
    if (deleted) {
      logger.info('Notification dequeued', { id });
    }
    return deleted;
  }

  /**
   * Get next notification to process
   */
  private getNextNotification(): QueuedNotification | null {
    const now = new Date();
    const readyNotifications: QueuedNotification[] = [];

    for (const notification of this.queue.values()) {
      // Check if scheduled for future
      if (notification.scheduledFor && notification.scheduledFor > now) {
        continue;
      }

      // Check if waiting for retry
      if (notification.nextRetryAt && notification.nextRetryAt > now) {
        continue;
      }

      readyNotifications.push(notification);
    }

    if (readyNotifications.length === 0) {
      return null;
    }

    // Sort by priority (urgent first)
    readyNotifications.sort((a, b) => {
      const priorityDiff = this.priorityWeights[b.priority] - this.priorityWeights[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      
      // If same priority, sort by creation time (oldest first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    return readyNotifications[0];
  }

  /**
   * Process notification
   */
  private async processNotification(notification: QueuedNotification): Promise<void> {
    try {
      logger.info('Processing notification', {
        id: notification.id,
        userId: notification.userId,
        priority: notification.priority,
      });

      // Deliver via each channel
      const results = new Map<NotificationChannel, DeliveryResult>();

      for (const channel of notification.channels) {
        const recipient = notification.recipients[channel];
        if (!recipient) continue;

        try {
          const result = await this.deliveryChannel.deliver(notification.payload, recipient);
          results.set(channel, result);

          if (result.success) {
            logger.info('Notification delivered successfully', {
              id: notification.id,
              channel,
            });
          } else {
            logger.warn('Notification delivery failed', {
              id: notification.id,
              channel,
              error: result.error,
            });
          }
        } catch (error) {
          logger.error('Notification delivery error', {
            id: notification.id,
            channel,
            error: error instanceof Error ? error.message : String(error),
          });

          results.set(channel, {
            success: false,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Check if any channel succeeded
      const anySuccess = Array.from(results.values()).some(r => r.success);
      const allFailed = Array.from(results.values()).every(r => !r.success);

      if (anySuccess) {
        // At least one channel succeeded, remove from queue
        this.queue.delete(notification.id);
        logger.info('Notification delivered successfully', {
          notificationId: notification.id,
          results: Array.from(results.entries()),
        });
      } else if (allFailed) {
        // All channels failed, schedule retry
        if (notification.retryCount < notification.maxRetries) {
          notification.retryCount++;
          notification.nextRetryAt = this.calculateNextRetry(notification.retryCount);
          
          logger.info('Notification scheduled for retry', {
            id: notification.id,
            retryCount: notification.retryCount,
            nextRetryAt: notification.nextRetryAt,
          });
        } else {
          // Max retries reached, remove from queue
          this.queue.delete(notification.id);
          logger.error('Notification failed - max retries exceeded', {
            notificationId: notification.id,
            results: Array.from(results.entries()),
          });
        }
      }
    } catch (error) {
      logger.error('Notification processing error', {
        id: notification.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Schedule retry
      if (notification.retryCount < notification.maxRetries) {
        notification.retryCount++;
        notification.nextRetryAt = this.calculateNextRetry(notification.retryCount);
        logger.info('Retry scheduled after processing error', {
          id: notification.id,
          retryCount: notification.retryCount,
        });
      } else {
        this.queue.delete(notification.id);
        logger.error('Notification failed - processing error', {
          id: notification.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(retryCount: number): Date {
    const delay = this.config.retryDelay * Math.pow(this.config.retryBackoffMultiplier, retryCount - 1);
    const nextRetry = new Date();
    nextRetry.setTime(nextRetry.getTime() + delay);
    return nextRetry;
  }

  /**
   * Start processing queue
   */
  private startProcessing(): void {
    if (this.processing) return;

    this.processing = true;
    logger.info('Notification queue processing started');

    const processLoop = async () => {
      while (this.processing) {
        const notification = this.getNextNotification();

        if (notification) {
          await this.processNotification(notification);
        }

        // Wait before next iteration (placeholder - implement proper delay in production)
        // For now, we'll skip the delay since this is a placeholder implementation
      }
    };

    processLoop().catch(error => {
      logger.error('Queue processing error', { error });
      this.processing = false;
    });
  }

  /**
   * Stop processing queue
   */
  stopProcessing(): void {
    this.processing = false;
    logger.info('Notification queue processing stopped');
  }

  /**
   * Get queue statistics
   */
  getStatistics(): {
    total: number;
    byPriority: Record<string, number>;
    byStatus: Record<string, number>;
    averageRetries: number;
  } {
    const notifications = Array.from(this.queue.values());
    const byPriority: Record<string, number> = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0,
    };
    const byStatus: Record<string, number> = {
      pending: 0,
      retrying: 0,
      scheduled: 0,
    };

    let totalRetries = 0;

    for (const notification of notifications) {
      byPriority[notification.priority]++;

      if (notification.nextRetryAt) {
        byStatus.retrying++;
      } else if (notification.scheduledFor && notification.scheduledFor > new Date()) {
        byStatus.scheduled++;
      } else {
        byStatus.pending++;
      }

      totalRetries += notification.retryCount;
    }

    return {
      total: notifications.length,
      byPriority,
      byStatus,
      averageRetries: notifications.length > 0 ? totalRetries / notifications.length : 0,
    };
  }

  /**
   * Get oldest notification
   */
  private getOldestNotification(): QueuedNotification | null {
    let oldest: QueuedNotification | null = null;

    for (const notification of this.queue.values()) {
      if (!oldest || notification.createdAt < oldest.createdAt) {
        oldest = notification;
      }
    }

    return oldest;
  }

  /**
   * Clear queue
   */
  clearQueue(): number {
    const count = this.queue.size;
    this.queue.clear();
    logger.info('Notification queue cleared', { count });
    return count;
  }

  /**
   * Retry specific notification
   */
  retryNotification(id: string): boolean {
    const notification = this.queue.get(id);
    if (!notification) return false;

    notification.retryCount = 0;
    notification.nextRetryAt = undefined;

    logger.info('Notification retry requested', { id });

    return true;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Notification queue configuration updated', { config: this.config });
  }

  /**
   * Get pending notifications for user
   */
  getUserPendingNotifications(userId: string): QueuedNotification[] {
    return Array.from(this.queue.values()).filter(
      n => n.userId === userId && !n.scheduledFor || (n.scheduledFor && n.scheduledFor <= new Date()),
    );
  }

  /**
   * Cancel scheduled notification
   */
  cancelNotification(id: string): boolean {
    const notification = this.queue.get(id);
    if (!notification) return false;

    // Only cancel if not yet processed
    if (notification.retryCount === 0 && !notification.nextRetryAt) {
      this.queue.delete(id);
      logger.info('Notification cancelled', { id });
      return true;
    }

    return false;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Check if queue is full
   */
  isQueueFull(): boolean {
    return this.queue.size >= this.config.maxQueueSize;
  }
}
