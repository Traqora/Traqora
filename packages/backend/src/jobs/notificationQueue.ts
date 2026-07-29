import Queue from "bull";
import { config } from "../config";

export type NotificationType =
  | "booking"
  | "reminder"
  | "refund"
  | "promotional"
  | "flight_delayed"
  | "flight_delayed_significant"
  | "flight_cancelled"
  | "gate_changed"
  | "boarding_reminder"
  | "flight_status"
  | "flight_status_shared"
  | "refund_initiated";

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  type: "booking" | "reminder" | "refund" | "promotional" | "price_alert" | "flight_status";
  data: Record<string, any>; // specific data for the template
  channels?: ("email" | "sms" | "push")[]; // Optional override of which channels to use
}

export const notificationQueue = new Queue<NotificationPayload>(
  "notifications",
  {
    redis: config.redisUrl || "redis://localhost:6379",
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: true,
    },
  },
);

export const scheduleNotification = async (
  payload: NotificationPayload,
  delayInMs?: number,
  priority: number = 2,
) => {
  const options: Queue.JobOptions = {
    priority,
  };

  if (delayInMs && delayInMs > 0) {
    options.delay = delayInMs;
  }

  return await notificationQueue.add(payload, options);
};
