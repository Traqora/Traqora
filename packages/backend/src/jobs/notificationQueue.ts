import Queue from "bull";
import { config } from "../config";
import { logger } from "../utils/logger";

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
  data: Record<string, any>; // specific data for the template
  channels?: ("email" | "sms" | "push")[]; // Optional override of which channels to use
}

export const notificationQueue = new Queue<NotificationPayload>(
  "notifications",
  {
    redis: config.redisUrl,
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

  const job = await notificationQueue.add(payload, options);
  logger.debug("notification-queue: job enqueued", {
    job: "notification-queue",
    jobId: job.id,
    step: "enqueue",
    type: payload.type,
    userId: payload.userId,
    channels: payload.channels,
  });
  return job;
};
