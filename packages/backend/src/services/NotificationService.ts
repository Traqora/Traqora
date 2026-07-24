import { scheduleNotification } from "../jobs/notificationQueue";
import { AppDataSource } from "../db/dataSource";
import { UserPreference } from "../db/entities/UserPreference";
import { NotificationDeliveryService, NotificationPayload } from "./NotificationDeliveryService";
import { NotificationType } from "../db/entities/NotificationPreference";
import { logger } from "../utils/logger";

export class NotificationService {
  private static instance: NotificationService;
  private deliveryService: NotificationDeliveryService;

  public constructor() {
    this.deliveryService = NotificationDeliveryService.getInstance();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // --- New Multi-Channel Delivery Methods ---

  public async sendBookingConfirmation(
    userId: string,
    bookingReference: string,
    flightNumber: string,
    departureDate: string,
  ) {
    const userPrefRepo = AppDataSource.getRepository(UserPreference);
    const pref = await userPrefRepo.findOne({ where: { userId } });
    if (!pref) {
      logger.warn(
        `User prefs not found for ${userId}, skipping booking confirmation.`,
      );
      return;
    }

    // Use the new multi-channel delivery system
    await this.deliveryService.send({
      userId,
      type: 'booking',
      title: 'Booking Confirmed',
      body: `Your flight ${flightNumber} on ${departureDate} is confirmed! Reference: ${bookingReference}`,
      data: { bookingReference, flightNumber, departureDate },
      priority: 1,
    });
  }

  public async scheduleFlightReminder(
    userId: string,
    flightNumber: string,
    departureDate: Date,
  ) {
    const reminderTime = new Date(departureDate);
    reminderTime.setHours(reminderTime.getHours() - 24); // 24 hours before

    const delay = reminderTime.getTime() - Date.now();
    if (delay > 0) {
      // Schedule via queue for delayed delivery
      await scheduleNotification(
        {
          userId,
          type: "reminder",
          data: { flightNumber, departureDate: departureDate.toISOString() },
        },
        delay,
        2,
      );
    } else {
      logger.warn(
        "Flight departs in less than 24 hours. Sending immediate reminder.",
      );
      // Send immediately via multi-channel delivery
      await this.deliveryService.send({
        userId,
        type: 'reminder',
        title: 'Flight Reminder',
        body: `Your flight ${flightNumber} departs in less than 24 hours! Please check in.`,
        data: { flightNumber, departureDate: departureDate.toISOString() },
        priority: 2,
      });
    }
  }

  public async sendRefundUpdate(
    userId: string,
    bookingReference: string,
    refundAmount: string,
  ) {
    await this.deliveryService.send({
      userId,
      type: 'refund',
      title: 'Refund Update',
      body: `A refund of ${refundAmount} for booking ${bookingReference} has been processed.`,
      data: { bookingReference, refundAmount },
      priority: 1,
    });
  }

  // --- Legacy Methods for backwards compatibility (e.g. priceMonitor) ---

  /**
   * Send an email notification
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param body - Email body content
   * @returns Promise<boolean> - True if sent successfully
   */
  public async sendEmail(
    to: string,
    subject: string,
    body: string,
  ): Promise<boolean> {
    try {
      logger.info(`[Email Notification] To: ${to}, Subject: ${subject}`);
      // Use the email service directly for legacy compatibility
      const { emailService } = await import('./EmailService');
      await emailService.send(to, 'system', { subject, body });
      return true;
    } catch (error) {
      logger.error("Failed to send email", error);
      return false;
    }
  }

  /**
   * Send a push notification to a user
   * @param userId - User ID to send notification to
   * @param message - Notification message content
   * @param data - Optional additional data payload
   * @returns Promise<boolean> - True if sent successfully
   */
  public async sendPushNotification(
    userId: string,
    message: string,
    data?: Record<string, unknown>,
  ): Promise<boolean> {
    try {
      logger.info(`[Push Notification] User: ${userId}, Message: ${message}`);
      
      // Use the new multi-channel delivery system
      await this.deliveryService.send({
        userId,
        type: 'system',
        title: 'Notification',
        body: message,
        data: data as Record<string, any>,
        channels: ['push'],
        priority: 2,
      });
      
      return true;
    } catch (error) {
      logger.error("Failed to send push notification", error);
      return false;
    }
  }

  /**
   * Send a price alert notification
   * @param userId - User ID to send notification to
   * @param flightId - Flight ID
   * @param currentPrice - Current price of the flight
   * @param targetPrice - Target price the user set
   * @param currency - Currency code
   * @returns Promise<boolean> - True if sent successfully
   */
  public async sendPriceAlert(
    userId: string,
    flightId: string,
    currentPrice: number,
    targetPrice: number,
    currency: string = 'USD',
  ): Promise<boolean> {
    try {
      const message = `Price Drop Alert! Flight ${flightId} is now ${currentPrice} ${currency}. Target price was ${targetPrice}.`;
      logger.info(`[Price Alert] User: ${userId}, Flight: ${flightId}, Price: ${currentPrice}`);
      
      // Use the new multi-channel delivery system
      await this.deliveryService.send({
        userId,
        type: 'price_alert',
        title: 'Price Alert',
        body: message,
        data: { flightId, currentPrice, targetPrice, currency },
        priority: 1,
      });
      
      return true;
    } catch (error) {
      logger.error("Failed to send price alert", error);
      return false;
    }
  }

  /**
   * Send a test notification to verify notification delivery
   * @param userId - User ID to send test notification to
   * @returns Promise<boolean> - True if sent successfully
   */
  public async sendTestNotification(userId: string): Promise<boolean> {
    try {
      logger.info(`[Test Notification] Sending test notification to user: ${userId}`);
      
      await this.deliveryService.send({
        userId,
        type: 'system',
        title: 'Test Notification',
        body: 'This is a test notification to verify your notification delivery settings.',
        data: { test: true },
        priority: 3,
      });
      
      return true;
    } catch (error) {
      logger.error("Failed to send test notification", error);
      return false;
    }
  }
}

export const notificationService = NotificationService.getInstance();
