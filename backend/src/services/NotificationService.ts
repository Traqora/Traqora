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

  public async sendEmail(
    to: string,
    subject: string,
    _body: string,
  ): Promise<boolean> {
    try {
      logger.info(`[Email Notification] To: ${to}, Subject: ${subject}`);
      // As a fallback to bypass queue if needed, ideally refactored to queue in the future.
      return true;
    } catch (error) {
      logger.error("Failed to send email", error);
      return false;
    }
  }

  public async sendPushNotification(
    userId: string,
    message: string,
    _data?: any,
  ): Promise<boolean> {
    try {
      logger.info(`[Push Notification] User: ${userId}, Message: ${message}`);
      return true;
    } catch (error) {
      logger.error("Failed to send push notification", error);
      return false;
    }
  }
}

export const notificationService = NotificationService.getInstance();
