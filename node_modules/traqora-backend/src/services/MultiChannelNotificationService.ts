/**
 * Multi-Channel Notification Delivery Service
 * Handles delivery across email, SMS, push, and in-app channels
 */

import { logger } from '../utils/logger';
import { AppDataSource } from '../db/dataSource';
import { NotificationPreference } from '../db/entities/NotificationPreference';
import { NotificationLog } from '../db/entities/NotificationLog';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationPayload,
  DeliveryStatus,
  NotificationPreference as NotificationPreferenceType,
  NotificationFrequency,
} from '../types/notification';

export interface DeliveryChannel {
  name: NotificationChannel;
  enabled: boolean;
  deliver(payload: NotificationPayload, recipient: string): Promise<DeliveryResult>;
}

export interface DeliveryResult {
  success: boolean;
  status: DeliveryStatus;
  externalId?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface MultiChannelConfig {
  channels: NotificationChannel[];
  defaultChannels: NotificationChannel[];
  retryAttempts: number;
  retryDelay: number;
}

const DEFAULT_CONFIG: MultiChannelConfig = {
  channels: ['email', 'sms', 'push', 'inapp'],
  defaultChannels: ['inapp', 'push'],
  retryAttempts: 3,
  retryDelay: 5000,
};

export class MultiChannelNotificationService {
  private config: MultiChannelConfig;
  private channels: Map<NotificationChannel, DeliveryChannel> = new Map();
  private repository = AppDataSource.getRepository(NotificationPreference);
  private logRepository = AppDataSource.getRepository(NotificationLog);

  constructor(config?: Partial<MultiChannelConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Register a delivery channel
   */
  registerChannel(channel: DeliveryChannel): void {
    this.channels.set(channel.name, channel);
    logger.info('Notification channel registered', { channel: channel.name });
  }

  /**
   * Unregister a delivery channel
   */
  unregisterChannel(channelName: NotificationChannel): void {
    this.channels.delete(channelName);
    logger.info('Notification channel unregistered', { channel: channelName });
  }

  /**
   * Get user preferences from database
   */
  async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    return this.repository.find({ where: { userId } });
  }

  /**
   * Get preference for specific channel and category
   */
  async getPreference(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): Promise<NotificationPreference | null> {
    return this.repository.findOne({
      where: { userId, channel, category },
    });
  }

  /**
   * Update user preference
   */
  async updatePreference(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
    updates: Partial<Pick<NotificationPreferenceType, 'frequency' | 'enabled'>>,
  ): Promise<NotificationPreference> {
    let preference = await this.getPreference(userId, channel, category);

    if (!preference) {
      preference = this.repository.create({
        userId,
        channel,
        category,
        frequency: updates.frequency || 'instant',
        enabled: updates.enabled !== undefined ? updates.enabled : true,
      });
    } else {
      if (updates.frequency !== undefined) preference.frequency = updates.frequency;
      if (updates.enabled !== undefined) preference.enabled = updates.enabled;
    }

    const saved = await this.repository.save(preference);
    
    logger.info('Notification preference updated', { userId, channel, category, preference: saved });

    return saved;
  }

  /**
   * Check if notification should be delivered via channel
   */
  async shouldDeliver(
    userId: string,
    channel: NotificationChannel,
    category: NotificationCategory,
  ): Promise<boolean> {
    const preference = await this.getPreference(userId, channel, category);

    // Default to enabled if no preference exists
    if (!preference) return true;

    return preference.enabled && preference.frequency !== 'never';
  }

  /**
   * Determine which channels to use for delivery
   */
  async getDeliveryChannels(
    userId: string,
    category: NotificationCategory,
    requestedChannels?: NotificationChannel[],
  ): Promise<NotificationChannel[]> {
    const channels = requestedChannels || this.config.defaultChannels;
    const deliveryChannels: NotificationChannel[] = [];

    for (const channel of channels) {
      const shouldDeliver = await this.shouldDeliver(userId, channel, category);
      if (shouldDeliver && this.channels.has(channel)) {
        deliveryChannels.push(channel);
      }
    }

    return deliveryChannels;
  }

  /**
   * Send notification via multiple channels
   */
  async sendNotification(
    userId: string,
    payload: NotificationPayload,
    recipient: Record<NotificationChannel, string>,
    requestedChannels?: NotificationChannel[],
  ): Promise<Map<NotificationChannel, DeliveryResult>> {
    const channels = await this.getDeliveryChannels(
      userId,
      payload.category,
      requestedChannels,
    );

    const results = new Map<NotificationChannel, DeliveryResult>();

    for (const channel of channels) {
      const channelImpl = this.channels.get(channel);
      if (!channelImpl) continue;

      try {
        const result = await channelImpl.deliver(payload, recipient[channel]);
        results.set(channel, result);

        // Log delivery attempt
        await this.logDelivery(userId, channel, payload.category, result);

        logger.info('Delivery attempt completed', {
          userId,
          channel,
          category: payload.category,
          result,
        });
      } catch (error) {
        const errorResult: DeliveryResult = {
          success: false,
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        };
        results.set(channel, errorResult);

        await this.logDelivery(userId, channel, payload.category, errorResult);

        logger.error('Delivery failed', {
          userId,
          channel,
          category: payload.category,
          error: errorResult.error,
        });
      }
    }

    return results;
  }

  /**
   * Retry failed delivery
   */
  async retryDelivery(
    userId: string,
    channel: NotificationChannel,
    payload: NotificationPayload,
    recipient: string,
    attempt: number = 1,
  ): Promise<DeliveryResult> {
    if (attempt > this.config.retryAttempts) {
      return {
        success: false,
        status: 'failed',
        error: 'Max retry attempts exceeded',
      };
    }

    const channelImpl = this.channels.get(channel);
    if (!channelImpl) {
      return {
        success: false,
        status: 'failed',
        error: 'Channel not available',
      };
    }

    // Add delay before retry (placeholder - implement proper delay in production)
    // For now, we'll skip the delay since this is a placeholder implementation

    try {
      const result = await channelImpl.deliver(payload, recipient);
      await this.logDelivery(userId, channel, payload.category, result);

      if (result.success) {
        logger.info('Delivery retry success', {
          userId,
          channel,
          category: payload.category,
          attempt,
        });
      }

      return result;
    } catch (error) {
      const errorResult: DeliveryResult = {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };

      // Retry if failed
      if (attempt < this.config.retryAttempts) {
        return this.retryDelivery(userId, channel, payload, recipient, attempt + 1);
      }

      return errorResult;
    }
  }

  /**
   * Log delivery attempt to database
   */
  private async logDelivery(
    userId: string,
    channel: NotificationChannel,
    type: string,
    result: DeliveryResult,
  ): Promise<void> {
    try {
      const log = this.logRepository.create({
        userId,
        channel,
        type,
        status: result.status,
        errorMessage: result.error,
        attempts: 1,
        payload: {
          success: result.success,
          externalId: result.externalId,
          metadata: result.metadata,
        },
      });

      await this.logRepository.save(log);
    } catch (error) {
      logger.error('Failed to log delivery', { error });
    }
  }

  /**
   * Get delivery history for user
   */
  async getDeliveryHistory(
    userId: string,
    limit: number = 100,
  ): Promise<NotificationLog[]> {
    return this.logRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get delivery statistics
   */
  async getStatistics(userId: string): Promise<{
    total: number;
    byChannel: Record<NotificationChannel, number>;
    byStatus: Record<DeliveryStatus, number>;
    successRate: number;
  }> {
    const logs = await this.getDeliveryHistory(userId, 1000);

    const byChannel: Record<NotificationChannel, number> = {
      email: 0,
      sms: 0,
      push: 0,
      inapp: 0,
    };

    const byStatus: Record<DeliveryStatus, number> = {
      pending: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
    };

    let successful = 0;

    for (const log of logs) {
      byChannel[log.channel as NotificationChannel]++;
      byStatus[log.status as DeliveryStatus]++;
      if (log.status === 'delivered') successful++;
    }

    return {
      total: logs.length,
      byChannel,
      byStatus,
      successRate: logs.length > 0 ? (successful / logs.length) * 100 : 0,
    };
  }

  /**
   * Batch update preferences
   */
  async batchUpdatePreferences(
    userId: string,
    updates: Array<{
      channel: NotificationChannel;
      category: NotificationCategory;
      enabled: boolean;
      frequency?: NotificationFrequency;
    }>,
  ): Promise<NotificationPreference[]> {
    const results: NotificationPreference[] = [];

    for (const update of updates) {
      const preference = await this.updatePreference(
        userId,
        update.channel,
        update.category,
        {
          enabled: update.enabled,
          frequency: update.frequency,
        },
      );
      results.push(preference);
    }

    return results;
  }

  /**
   * Reset all preferences to defaults
   */
  async resetPreferences(userId: string): Promise<void> {
    await this.repository.delete({ userId });
    logger.info('Notification preferences reset', { userId });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<MultiChannelConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Multi-channel notification configuration updated', { config: this.config });
  }
}
