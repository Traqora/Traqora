import { AppDataSource } from '../db/dataSource';
import { NotificationPreference, NotificationType, NotificationChannel } from '../db/entities/NotificationPreference';
import { InAppNotification } from '../db/entities/InAppNotification';
import { NotificationDeliveryLog, DeliveryStatus } from '../db/entities/NotificationDeliveryLog';
import { emailService } from './EmailService';
import { smsService } from './SMSService';
import { pushNotificationService } from './PushNotificationService';
import { logger } from '../utils/logger';
import { MoreThan } from 'typeorm';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title?: string;
  body: string;
  data?: Record<string, any>;
  channels?: NotificationChannel[]; // Optional override; if not provided, uses preferences
  priority?: number; // 1 = high, 2 = normal, 3 = low
}

export interface DeliveryResult {
  channel: NotificationChannel;
  status: 'success' | 'skipped' | 'rate_limited' | 'quiet_hours' | 'error';
  error?: string;
  deliveryLogId?: string;
}

export class NotificationDeliveryService {
  private static instance: NotificationDeliveryService;

  private constructor() {}

  public static getInstance(): NotificationDeliveryService {
    if (!NotificationDeliveryService.instance) {
      NotificationDeliveryService.instance = new NotificationDeliveryService();
    }
    return NotificationDeliveryService.instance;
  }

  /**
   * Send a notification through all appropriate channels based on user preferences.
   * This is the main entry point for sending notifications.
   */
  public async send(payload: NotificationPayload): Promise<DeliveryResult[]> {
    const { userId, type, title, body, data = {}, channels } = payload;
    const results: DeliveryResult[] = [];

    try {
      const prefRepo = AppDataSource.getRepository(NotificationPreference);
      let userPref = await prefRepo.findOne({ where: { userId } });

      if (!userPref) {
        // Create default preferences if none exist
        userPref = prefRepo.create({ userId });
        userPref = await prefRepo.save(userPref);
      }

      // Determine which channels to use
      let targetChannels: NotificationChannel[];
      if (channels && channels.length > 0) {
        targetChannels = channels;
      } else {
        targetChannels = userPref.getEnabledChannelsForType(type);
      }

      if (targetChannels.length === 0) {
        logger.info(`No enabled channels for user ${userId}, notification type ${type}`);
        return [{ channel: 'in_app' as NotificationChannel, status: 'skipped' }];
      }

      // Check quiet hours - non-urgent notifications should be suppressed
      const isInQuietHours = userPref.isInQuietHours();
      const isHighPriority = payload.priority === 1 || type === 'booking' || type === 'refund';

      // Create in-app notification first (always deliver in-app unless quiet hours for non-urgent)
      let inAppNotificationId: string | null = null;
      if (userPref.inAppEnabled && !userPref.isInQuietHours()) {
        const inAppRepo = AppDataSource.getRepository(InAppNotification);
        const inAppNotification = inAppRepo.create({
          userId,
          type,
          title: title || this.generateDefaultTitle(type),
          body,
          data,
        });
        const saved = await inAppRepo.save(inAppNotification);
        inAppNotificationId = saved.id;
        results.push({
          channel: 'in_app',
          status: 'success',
        });
      } else if (userPref.inAppEnabled) {
        // Still create in-app notification but suppress if quiet hours & non-urgent
        if (isHighPriority || !isInQuietHours) {
          const inAppRepo = AppDataSource.getRepository(InAppNotification);
          const inAppNotification = inAppRepo.create({
            userId,
            type,
            title: title || this.generateDefaultTitle(type),
            body,
            data,
          });
          const saved = await inAppRepo.save(inAppNotification);
          inAppNotificationId = saved.id;
          results.push({
            channel: 'in_app',
            status: 'success',
          });
        } else {
          results.push({
            channel: 'in_app',
            status: 'quiet_hours',
          });
        }
      }

      // Deliver through each channel
      for (const channel of targetChannels) {
        if (channel === 'in_app') continue; // Already handled above

        // Skip channels that are suppressed by quiet hours
        if (isInQuietHours && !isHighPriority) {
          results.push({
            channel,
            status: 'quiet_hours',
          });
          continue;
        }

        // Check rate limits
        const rateLimitCheck = await this.checkRateLimit(userId, channel, userPref);
        if (!rateLimitCheck.allowed) {
          results.push({
            channel,
            status: 'rate_limited',
            error: rateLimitCheck.reason,
          });
          continue;
        }

        // Deliver via the channel
        const result = await this.deliverViaChannel(
          channel,
          userId,
          type,
          title,
          body,
          data,
          userPref,
          inAppNotificationId,
        );
        results.push(result);
      }

      return results;
    } catch (error: any) {
      logger.error(`NotificationDeliveryService.send error for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Deliver a notification via a specific channel
   */
  private async deliverViaChannel(
    channel: NotificationChannel,
    userId: string,
    type: NotificationType,
    title: string | undefined,
    body: string,
    data: Record<string, any>,
    userPref: NotificationPreference,
    notificationId: string | null,
  ): Promise<DeliveryResult> {
    const logRepo = AppDataSource.getRepository(NotificationDeliveryLog);
    let recipient: string | undefined;
    let logEntry: NotificationDeliveryLog | null = null;

    try {
      switch (channel) {
        case 'email': {
          if (!userPref.email) {
            return { channel, status: 'skipped', error: 'No email address configured' };
          }
          recipient = userPref.email;
          logEntry = logRepo.create({
            notificationId,
            userId,
            notificationType: type,
            channel: 'email',
            status: 'pending',
            recipient: userPref.email,
            subject: title || this.generateDefaultTitle(type),
            body,
          });
          logEntry = await logRepo.save(logEntry);

          await emailService.send(userPref.email, type, {
            ...data,
            subject: title || this.generateDefaultTitle(type),
            body,
          });

          logEntry.status = 'sent';
          logEntry.attempts += 1;
          logEntry.deliveredAt = new Date();
          await logRepo.save(logEntry);

          return { channel, status: 'success', deliveryLogId: logEntry.id };
        }

        case 'sms': {
          if (!userPref.phoneNumber) {
            return { channel, status: 'skipped', error: 'No phone number configured' };
          }
          recipient = userPref.phoneNumber;
          logEntry = logRepo.create({
            notificationId,
            userId,
            notificationType: type,
            channel: 'sms',
            status: 'pending',
            recipient: userPref.phoneNumber,
            body,
          });
          logEntry = await logRepo.save(logEntry);

          await smsService.send(userPref.phoneNumber, type, data);

          logEntry.status = 'sent';
          logEntry.attempts += 1;
          logEntry.deliveredAt = new Date();
          await logRepo.save(logEntry);

          return { channel, status: 'success', deliveryLogId: logEntry.id };
        }

        case 'push': {
          if (!userPref.fcmToken) {
            return { channel, status: 'skipped', error: 'No FCM token configured' };
          }
          recipient = 'fcm_token';
          logEntry = logRepo.create({
            notificationId,
            userId,
            notificationType: type,
            channel: 'push',
            status: 'pending',
            recipient: 'fcm_token',
            subject: title || this.generateDefaultTitle(type),
            body,
          });
          logEntry = await logRepo.save(logEntry);

          await pushNotificationService.send(userPref.fcmToken, type, data);

          logEntry.status = 'sent';
          logEntry.attempts += 1;
          logEntry.deliveredAt = new Date();
          await logRepo.save(logEntry);

          return { channel, status: 'success', deliveryLogId: logEntry.id };
        }

        case 'webhook': {
          if (!userPref.webhookUrl) {
            return { channel, status: 'skipped', error: 'No webhook URL configured' };
          }
          recipient = userPref.webhookUrl;
          logEntry = logRepo.create({
            notificationId,
            userId,
            notificationType: type,
            channel: 'webhook',
            status: 'pending',
            recipient: userPref.webhookUrl,
            body,
          });
          logEntry = await logRepo.save(logEntry);

          await this.sendWebhook(userPref.webhookUrl, type, { ...data, title, body });

          logEntry.status = 'sent';
          logEntry.attempts += 1;
          logEntry.deliveredAt = new Date();
          await logRepo.save(logEntry);

          return { channel, status: 'success', deliveryLogId: logEntry.id };
        }

        default:
          return { channel, status: 'error', error: `Unknown channel: ${channel}` };
      }
    } catch (error: any) {
      logger.error(`Failed to deliver ${channel} notification to user ${userId}`, error);

      // Update the delivery log
      if (logEntry) {
        logEntry.status = 'failed';
        logEntry.errorMessage = error.message;
        logEntry.attempts += 1;
        logEntry.nextRetryAt = this.calculateRetryDelay(logEntry.attempts);
        await logRepo.save(logEntry);
      }

      return {
        channel,
        status: 'error',
        error: error.message,
        deliveryLogId: logEntry?.id,
      };
    }
  }

  /**
   * Check if a user has exceeded the rate limit for a channel
   */
  private async checkRateLimit(
    userId: string,
    channel: NotificationChannel,
    userPref: NotificationPreference,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const logRepo = AppDataSource.getRepository(NotificationDeliveryLog);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    let maxAllowed: number;
    switch (channel) {
      case 'email':
        maxAllowed = userPref.maxEmailPerHour;
        break;
      case 'sms':
        maxAllowed = userPref.maxSmsPerHour;
        break;
      case 'push':
        maxAllowed = userPref.maxPushPerHour;
        break;
      case 'in_app':
        maxAllowed = userPref.maxInAppPerHour;
        break;
      default:
        return { allowed: true };
    }

    const count = await logRepo.count({
      where: {
        userId,
        channel,
        createdAt: MoreThan(oneHourAgo),
      },
    });

    if (count >= maxAllowed) {
      return {
        allowed: false,
        reason: `Rate limit exceeded for ${channel}: ${count}/${maxAllowed} per hour`,
      };
    }

    return { allowed: true };
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempts: number): Date {
    const baseDelayMs = 60_000; // 1 minute
    const maxDelayMs = 3_600_000; // 1 hour
    const delay = Math.min(baseDelayMs * Math.pow(2, attempts - 1), maxDelayMs);
    return new Date(Date.now() + delay);
  }

  /**
   * Send a webhook notification
   */
  private async sendWebhook(
    webhookUrl: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Traqora-Notification-Service/1.0',
        },
        body: JSON.stringify({
          event: `notification.${type}`,
          timestamp: new Date().toISOString(),
          payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned status ${response.status}: ${response.statusText}`);
      }
    } catch (error: any) {
      throw new Error(`Webhook delivery failed: ${error.message}`);
    }
  }

  /**
   * Generate a default title for a notification type
   */
  private generateDefaultTitle(type: NotificationType): string {
    const titles: Record<string, string> = {
      booking: 'Booking Confirmation',
      reminder: 'Flight Reminder',
      refund: 'Refund Update',
      promotional: 'Special Offer',
      price_alert: 'Price Alert',
      system: 'System Notification',
    };
    return titles[type] || 'Notification';
  }

  /**
   * Mark an in-app notification as read
   */
  public async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    const inAppRepo = AppDataSource.getRepository(InAppNotification);
    const notification = await inAppRepo.findOne({ where: { id: notificationId, userId } });

    if (!notification) {
      return false;
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await inAppRepo.save(notification);
    return true;
  }

  /**
   * Mark all in-app notifications as read for a user
   */
  public async markAllAsRead(userId: string): Promise<number> {
    const inAppRepo = AppDataSource.getRepository(InAppNotification);
    const result = await inAppRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return result.affected || 0;
  }

  /**
   * Archive an in-app notification
   */
  public async archiveNotification(userId: string, notificationId: string): Promise<boolean> {
    const inAppRepo = AppDataSource.getRepository(InAppNotification);
    const notification = await inAppRepo.findOne({ where: { id: notificationId, userId } });

    if (!notification) {
      return false;
    }

    notification.isArchived = true;
    await inAppRepo.save(notification);
    return true;
  }

  /**
   * Get unread notification count for a user
   */
  public async getUnreadCount(userId: string): Promise<number> {
    const inAppRepo = AppDataSource.getRepository(InAppNotification);
    return inAppRepo.count({
      where: { userId, isRead: false, isArchived: false },
    });
  }

  /**
   * Get in-app notifications for a user with pagination
   */
  public async getNotifications(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      unreadOnly?: boolean;
      includeArchived?: boolean;
    } = {},
  ): Promise<{ notifications: InAppNotification[]; total: number; unreadCount: number }> {
    const { limit = 20, offset = 0, unreadOnly = false, includeArchived = false } = options;
    const inAppRepo = AppDataSource.getRepository(InAppNotification);

    const where: any = { userId };
    if (unreadOnly) {
      where.isRead = false;
    }
    if (!includeArchived) {
      where.isArchived = false;
    }

    const [notifications, total] = await inAppRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    const unreadCount = await this.getUnreadCount(userId);

    return { notifications, total, unreadCount };
  }

  /**
   * Get delivery log for a specific notification or user
   */
  public async getDeliveryLog(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      channel?: string;
      status?: DeliveryStatus;
      notificationId?: string;
    } = {},
  ): Promise<{ logs: NotificationDeliveryLog[]; total: number }> {
    const { limit = 20, offset = 0, channel, status, notificationId } = options;
    const logRepo = AppDataSource.getRepository(NotificationDeliveryLog);

    const where: any = { userId };
    if (channel) where.channel = channel;
    if (status) where.status = status;
    if (notificationId) where.notificationId = notificationId;

    const [logs, total] = await logRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { logs, total };
  }

  /**
   * Retry failed delivery attempts
   */
  public async retryFailedDeliveries(userId?: string): Promise<number> {
    const logRepo = AppDataSource.getRepository(NotificationDeliveryLog);

    const where: any = {
      status: 'failed',
      attempts: MoreThan(0),
    };
    // Only retry those that haven't exceeded max attempts
    // This needs to be filtered in application logic since MySQL doesn't support raw comparison
    if (userId) where.userId = userId;

    const failedLogs = await logRepo.find({ where });

    let retryCount = 0;
    for (const log of failedLogs) {
      if (log.attempts >= log.maxAttempts) continue;
      if (log.nextRetryAt && log.nextRetryAt > new Date()) continue;

      // Reset status to pending so the worker can process it
      log.status = 'pending';
      log.nextRetryAt = this.calculateRetryDelay(log.attempts);
      await logRepo.save(log);
      retryCount++;
    }

    return retryCount;
  }
}

export const notificationDeliveryService = NotificationDeliveryService.getInstance();