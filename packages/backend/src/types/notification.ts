/**
 * Notification Types & Preferences
 */

export type NotificationChannel = "email" | "sms" | "push" | "inapp";
export type NotificationCategory =
  | "booking"
  | "payment"
  | "itinerary"
  | "collaboration"
  | "marketing"
  | "system";
export type NotificationFrequency = "instant" | "daily" | "weekly" | "never";
export type DeliveryStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "bounced";

export interface NotificationPreference {
  id: string;
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  frequency: NotificationFrequency;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserNotificationSettings {
  userId: string;
  emailAddress: string;
  phoneNumber?: string;
  preferences: NotificationPreference[];
  doNotDisturb?: {
    enabled: boolean;
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    timezone: string;
  };
  unsubscribeToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationPayload {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, any>;
  actionUrl?: string;
  timestamp: Date;
}

export interface ChannelDelivery {
  channel: NotificationChannel;
  status: DeliveryStatus;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
  retryCount: number;
  nextRetryAt?: Date;
}

export interface Notification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  data?: Record<string, any>;
  actionUrl?: string;
  read: boolean;
  readAt?: Date;
  deliveries: ChannelDelivery[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface NotificationTemplate {
  id: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  subject?: string;
  template: string; // Template string with {{variables}}
  variables: string[];
  createdAt: Date;
}

export interface NotificationEvent {
  type: string;
  userId: string;
  category: NotificationCategory;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  auth: string; // Base64 encoded auth key
  p256dh: string; // Base64 encoded public key
  userAgent: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
}

export interface SMSDelivery {
  id: string;
  phoneNumber: string;
  message: string;
  status: DeliveryStatus;
  provider: "twilio" | "aws-sns" | "vonage";
  externalId?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  failureReason?: string;
}

export interface DeliveryLog {
  id: string;
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  message?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface NotificationPreferenceUpdate {
  channel: NotificationChannel;
  category: NotificationCategory;
  frequency: NotificationFrequency;
  enabled: boolean;
}
