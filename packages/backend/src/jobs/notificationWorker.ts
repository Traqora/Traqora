import { notificationQueue } from "./notificationQueue";
import { NotificationDeliveryService } from "../services/NotificationDeliveryService";
import { logger } from "../utils/logger";

export const setupNotificationWorker = () => {
  const deliveryService = NotificationDeliveryService.getInstance();

  notificationQueue.process(async (job) => {
    const { userId, type, data, channels } = job.data;

    logger.info(`Processing notification job ${job.id} for user ${userId}, type: ${type}`);

    // Use the new multi-channel delivery system
    const results = await deliveryService.send({
      userId,
      type: type as any,
      title: data?.subject || undefined,
      body: data?.body || data?.message || generateDefaultBody(type, data),
      data: data || {},
      channels: channels as any,
      priority: job.opts?.priority || 2,
    });

    return results;
  });

  notificationQueue.on("failed", (job, err) => {
    logger.error(`Notification job ${job.id} failed with error: ${err.message}`);
  });

  notificationQueue.on("completed", (job, result) => {
    logger.info(`Notification job ${job.id} completed with result:`, result);
  });
};

// Helper function to generate default body text for notification types
function generateDefaultBody(type: string, data: Record<string, any>): string {
  switch (type) {
    case 'booking':
      return `Your flight ${data.flightNumber || ''} is confirmed! Ref: ${data.bookingReference || ''}`;
    case 'reminder':
      return `Your flight ${data.flightNumber || ''} departs in 24 hours!`;
    case 'refund':
      return `Refund of ${data.refundAmount || ''} for booking ${data.bookingReference || ''} processed.`;
    case 'price_alert':
      return `Price Drop Alert! Flight ${data.flightId || ''} is now ${data.currentPrice || ''} ${data.currency || 'USD'}.`;
    case 'promotional':
      return data.body || 'Check out our latest offers!';
    default:
      return data.body || data.message || 'You have a new notification';
  }
}
