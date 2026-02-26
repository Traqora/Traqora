import Queue from "bull";
import { config } from "../config";

export interface NotificationPayload {
  userId: string;
  type: "booking" | "reminder" | "refund" | "promotional";
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
