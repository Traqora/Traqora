import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type NotificationType = 'booking' | 'reminder' | 'refund' | 'promotional' | 'price_alert' | 'system';
export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'webhook';
export type DigestFrequency = 'instant' | 'daily' | 'weekly';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'booking',
  'reminder',
  'refund',
  'promotional',
  'price_alert',
  'system',
];

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  'email',
  'sms',
  'push',
  'in_app',
  'webhook',
];

export const DEFAULT_TYPE_CHANNEL_PREFERENCES: Record<NotificationType, NotificationChannel[]> = {
  booking: ['email', 'in_app'],
  reminder: ['email', 'sms', 'push', 'in_app'],
  refund: ['email', 'in_app'],
  promotional: ['email'],
  price_alert: ['email', 'push', 'in_app'],
  system: ['in_app'],
};

@Entity({ name: 'notification_preferences' })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  // Channel-level master toggles
  @Column({ type: 'boolean', default: true })
  emailEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  smsEnabled!: boolean;

  @Column({ type: 'boolean', default: true })
  pushEnabled!: boolean;

  @Column({ type: 'boolean', default: true })
  inAppEnabled!: boolean;

  @Column({ type: 'boolean', default: false })
  webhookEnabled!: boolean;

  // Contact details
  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phoneNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  fcmToken?: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  webhookUrl?: string | null;

  // Per-notification-type channel preferences
  @Column({ type: 'json', default: {} })
  typeChannelPreferences!: Record<string, string[]>;

  // Quiet hours / do-not-disturb settings
  @Column({ type: 'boolean', default: false })
  quietHoursEnabled!: boolean;

  @Column({ type: 'varchar', length: 5, default: '22:00' })
  quietHoursStart!: string;

  @Column({ type: 'varchar', length: 5, default: '07:00' })
  quietHoursEnd!: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  quietHoursTimezone!: string;

  // Notification frequency/digest settings
  @Column({ type: 'boolean', default: false })
  digestEnabled!: boolean;

  @Column({ type: 'varchar', length: 16, default: 'daily' })
  digestFrequency!: DigestFrequency;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  lastDigestSentAt?: Date | null;

  // Rate limiting per channel
  @Column({ type: 'integer', default: 10 })
  maxEmailPerHour!: number;

  @Column({ type: 'integer', default: 5 })
  maxSmsPerHour!: number;

  @Column({ type: 'integer', default: 20 })
  maxPushPerHour!: number;

  @Column({ type: 'integer', default: 50 })
  maxInAppPerHour!: number;

  // Metadata
  @Column({ type: 'json', default: {} })
  metadata!: Record<string, any>;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;

  /**
   * Get the enabled channels for a specific notification type, respecting master toggles
   */
  getEnabledChannelsForType(notificationType: NotificationType): NotificationChannel[] {
    const masterEnabled: NotificationChannel[] = [];
    if (this.emailEnabled) masterEnabled.push('email');
    if (this.smsEnabled) masterEnabled.push('sms');
    if (this.pushEnabled) masterEnabled.push('push');
    if (this.inAppEnabled) masterEnabled.push('in_app');
    if (this.webhookEnabled) masterEnabled.push('webhook');

    // Get type-specific preferences, falling back to defaults
    const typePrefs = this.typeChannelPreferences?.[notificationType] as NotificationChannel[] | undefined;
    const preferredChannels = typePrefs ?? DEFAULT_TYPE_CHANNEL_PREFERENCES[notificationType] ?? ['in_app'];

    // Intersect with master enabled channels
    return preferredChannels.filter((channel) => masterEnabled.includes(channel));
  }

  /**
   * Check if current time falls within quiet hours
   */
  isInQuietHours(): boolean {
    if (!this.quietHoursEnabled) return false;

    const now = new Date();
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

    const [startHours, startMinutes] = this.quietHoursStart.split(':').map(Number);
    const [endHours, endMinutes] = this.quietHoursEnd.split(':').map(Number);

    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;

    if (startTotal <= endTotal) {
      // Same day range (e.g., 01:00 - 07:00)
      return currentMinutes >= startTotal && currentMinutes < endTotal;
    } else {
      // Overnight range (e.g., 22:00 - 07:00)
      return currentMinutes >= startTotal || currentMinutes < endTotal;
    }
  }
}