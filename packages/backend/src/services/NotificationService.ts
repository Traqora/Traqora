import { scheduleNotification } from "../jobs/notificationQueue";
import { AppDataSource } from "../db/dataSource";
import { UserPreference } from "../db/entities/UserPreference";
import { logger } from "../utils/logger";

export class NotificationService {
  private static instance: NotificationService;

  public constructor() {}

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  // --- New Queue-based Methods ---

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

    await scheduleNotification(
      {
        userId,
        type: "booking",
        data: { bookingReference, flightNumber, departureDate },
      },
      0,
      1,
    ); // High priority
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
      await scheduleNotification(
        {
          userId,
          type: "reminder",
          data: { flightNumber, departureDate: departureDate.toISOString() },
        },
        delay,
        2,
      ); // Default priority
    } else {
      logger.warn(
        "Flight departs in less than 24 hours. Sending immediate reminder.",
      );
      await scheduleNotification(
        {
          userId,
          type: "reminder",
          data: { flightNumber, departureDate: departureDate.toISOString() },
        },
        0,
        2,
      );
    }
  }

  public async sendRefundUpdate(
    userId: string,
    bookingReference: string,
    refundAmount: string,
  ) {
    await scheduleNotification(
      {
        userId,
        type: "refund",
        data: { bookingReference, refundAmount },
      },
      0,
      2,
    );
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
      // In production, this would send via SendGrid, SES, or SMTP
      // For now, we log and return success
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
      
      // In production, this would send via Firebase Cloud Messaging, Web Push API, etc.
      // TODO: Implement actual push notification delivery
      // const result = await sendFcmNotification(userId, message, data);
      // return result.success;
      
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
      
      // Send via queue for better reliability
      await scheduleNotification(
        {
          userId,
          type: "price_alert",
          data: {
            flightId,
            currentPrice,
            targetPrice,
            currency,
          },
        },
        0,
        1, // High priority
      );
      
      return true;
    } catch (error) {
      logger.error("Failed to send price alert", error);
      return false;
    }
  }

  /**
   * Send a flight status change notification (delay, cancellation, gate
   * change, etc.) — mirrors sendPriceAlert's shape and priority.
   * @param userId - User ID to send notification to
   * @param flightId - Flight ID
   * @param status - New status (e.g. "delayed", "cancelled", "gate_changed")
   * @param details - Optional extra context (gate, delay minutes, reason)
   * @returns Promise<boolean> - True if sent successfully
   */
  public async sendFlightStatusAlert(
    userId: string,
    flightId: string,
    status: string,
    details?: { gate?: string; delayMinutes?: number; reason?: string },
  ): Promise<boolean> {
    try {
      const message = this.buildFlightStatusMessage(flightId, status, details);
      logger.info(`[Flight Status Alert] User: ${userId}, Flight: ${flightId}, Status: ${status}`);

      await scheduleNotification(
        {
          userId,
          type: "flight_status",
          data: {
            flightId,
            status,
            ...details,
            message,
          },
        },
        0,
        1, // High priority — status changes are time-sensitive
      );

      return true;
    } catch (error) {
      logger.error("Failed to send flight status alert", error);
      return false;
    }
  }

  private buildFlightStatusMessage(
    flightId: string,
    status: string,
    details?: { gate?: string; delayMinutes?: number; reason?: string },
  ): string {
    switch (status) {
      case "delayed":
        return details?.delayMinutes
          ? `Flight ${flightId} is delayed by ${details.delayMinutes} minutes.`
          : `Flight ${flightId} is delayed.`;
      case "cancelled":
        return details?.reason
          ? `Flight ${flightId} has been cancelled: ${details.reason}`
          : `Flight ${flightId} has been cancelled.`;
      case "gate_changed":
        return details?.gate
          ? `Flight ${flightId}'s gate has changed to ${details.gate}.`
          : `Flight ${flightId}'s gate has changed.`;
      case "boarding":
        return `Flight ${flightId} is now boarding.`;
      case "departed":
        return `Flight ${flightId} has departed.`;
      default:
        return `Flight ${flightId} status updated: ${status}.`;
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
      return true;
    } catch (error) {
      logger.error("Failed to send test notification", error);
      return false;
    }
  }
}

export const notificationService = NotificationService.getInstance();