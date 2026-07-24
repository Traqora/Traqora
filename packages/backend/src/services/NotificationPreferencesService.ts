import { AppDataSource } from '../db/dataSource';
import {
  NotificationPreference,
  NotificationType,
  NotificationChannel,
  NOTIFICATION_TYPES,
  NOTIFICATION_CHANNELS,
  DEFAULT_TYPE_CHANNEL_PREFERENCES,
} from '../db/entities/NotificationPreference';
import { InAppNotification } from '../db/entities/InAppNotification';
import { logger } from '../utils/logger';

export interface UpdateNotificationPreferencesInput {
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  webhookEnabled?: boolean;
  email?: string;
  phoneNumber?: string;
  fcmToken?: string;
  webhookUrl?: string;
  typeChannelPreferences?: Record<string, string[]>;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursTimezone?: string;
  digestEnabled?: boolean;
  digestFrequency?: 'instant' | 'daily' | 'weekly';
  maxEmailPerHour?: number;
  maxSmsPerHour?: number;
  maxPushPerHour?: number;
  maxInAppPerHour?: number;
  metadata?: Record<string, any>;
}

export class NotificationPreferencesService {
  private static instance: NotificationPreferencesService;

  private constructor() {}

  public static getInstance(): NotificationPreferencesService {
    if (!NotificationPreferencesService.instance) {
      NotificationPreferencesService.instance = new NotificationPreferencesService();
    }
    return NotificationPreferencesService.instance;
  }

  /**
   * Get or create notification preferences for a user
   */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    const prefRepo = AppDataSource.getRepository(NotificationPreference);
    let prefs = await prefRepo.findOne({ where: { userId } });

    if (!prefs) {
      prefs = prefRepo.create({ userId });
      prefs = await prefRepo.save(prefs);
      logger.info(`Created default notification preferences for user ${userId}`);
    }

    return prefs;
  }

  /**
   * Update notification preferences for a user
   */
  async updatePreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreference> {
    const prefRepo = AppDataSource.getRepository(NotificationPreference);
    let prefs = await prefRepo.findOne({ where: { userId } });

    if (!prefs) {
      prefs = prefRepo.create({ userId });
    }

    // Update only provided fields
    const updatableFields: (keyof UpdateNotificationPreferencesInput)[] = [
      'emailEnabled',
      'smsEnabled',
      'pushEnabled',
      'inAppEnabled',
      'webhookEnabled',
      'email',
      'phoneNumber',
      'fcmToken',
      'webhookUrl',
      'typeChannelPreferences',
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
      'quietHoursTimezone',
      'digestEnabled',
      'digestFrequency',
      'maxEmailPerHour',
      'maxSmsPerHour',
      'maxPushPerHour',
      'maxInAppPerHour',
      'metadata',
    ];

    for (const field of updatableFields) {
      if (input[field] !== undefined) {
        (prefs as any)[field] = input[field];
      }
    }

    // Validate quiet hours format
    if (input.quietHoursStart && !/^\d{2}:\d{2}$/.test(input.quietHoursStart)) {
      throw new Error('Invalid quiet hours start format. Use HH:MM (24-hour format)');
    }
    if (input.quietHoursEnd && !/^\d{2}:\d{2}$/.test(input.quietHoursEnd)) {
      throw new Error('Invalid quiet hours end format. Use HH:MM (24-hour format)');
    }

    // Validate type channel preferences
    if (input.typeChannelPreferences) {
      for (const [type, channels] of Object.entries(input.typeChannelPreferences)) {
        if (!NOTIFICATION_TYPES.includes(type as NotificationType)) {
          throw new Error(`Invalid notification type: ${type}`);
        }
        for (const channel of channels) {
          if (!NOTIFICATION_CHANNELS.includes(channel as NotificationChannel)) {
            throw new Error(`Invalid notification channel: ${channel}`);
          }
        }
      }
    }

    const saved = await prefRepo.save(prefs);
    logger.info(`Updated notification preferences for user ${userId}`);
    return saved;
  }

  /**
   * Reset notification preferences to defaults for a user
   */
  async resetPreferences(userId: string): Promise<NotificationPreference> {
    const prefRepo = AppDataSource.getRepository(NotificationPreference);
    let prefs = await prefRepo.findOne({ where: { userId } });

    if (prefs) {
      await prefRepo.remove(prefs);
    }

    const freshPrefs = prefRepo.create({ userId });
    const saved = await prefRepo.save(freshPrefs);
    logger.info(`Reset notification preferences to defaults for user ${userId}`);
    return saved;
  }

  /**
   * Delete notification preferences for a user
   */
  async deletePreferences(userId: string): Promise<void> {
    const prefRepo = AppDataSource.getRepository(NotificationPreference);
    const prefs = await prefRepo.findOne({ where: { userId } });

    if (prefs) {
      await prefRepo.remove(prefs);
      logger.info(`Deleted notification preferences for user ${userId}`);
    }
  }

  /**
   * Set per-type channel preferences for a user
   */
  async setTypeChannelPreferences(
    userId: string,
    type: NotificationType,
    channels: NotificationChannel[],
  ): Promise<NotificationPreference> {
    const prefRepo = AppDataSource.getRepository(NotificationPreference);
    let prefs = await prefRepo.findOne({ where: { userId } });

    if (!prefs) {
      prefs = prefRepo.create({ userId });
    }

    if (!prefs.typeChannelPreferences) {
      prefs.typeChannelPreferences = {};
    }

    prefs.typeChannelPreferences[type] = channels;
    const saved = await prefRepo.save(prefs);
    return saved;
  }

  /**
   * Get the effective channels for a specific notification type
   */
  async getEffectiveChannels(
    userId: string,
    type: NotificationType,
  ): Promise<NotificationChannel[]> {
    const prefs = await this.getPreferences(userId);
    return prefs.getEnabledChannelsForType(type);
  }

  /**
   * Validate and normalize a phone number (basic validation)
   */
  validatePhoneNumber(phone: string): boolean {
    // Basic E.164 format validation
    return /^\+[1-9]\d{1,14}$/.test(phone);
  }
}

export const notificationPreferencesService = NotificationPreferencesService.getInstance();