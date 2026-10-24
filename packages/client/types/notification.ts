/**
 * Client-side notification types
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
  createdAt: Date;
}

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  userAgent: string;
  isActive: boolean;
  createdAt: Date;
}
