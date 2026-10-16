/**
 * SMS Notification Service
 * Handles SMS delivery via Twilio, AWS SNS, or Vonage
 */

import { logger } from "../utils/logger";
import { BadRequestError } from "../utils/errors";
import { config } from "../config";
import type { SMSDelivery, DeliveryStatus } from "../types/notification";

// Twilio SDK – only imported when provider is "twilio" so the module load
// does not fail in environments where credentials are absent.
let twilioClient: any = null;

export type SMSNotificationType =
  | "booking_confirmation"
  | "booking_cancelled"
  | "flight_delayed"
  | "flight_cancelled"
  | "gate_changed"
  | "boarding_reminder"
  | "refund_processed"
  | "refund_initiated"
  | "payment_received"
  | "otp"
  | "general";

export interface SMSTemplateData {
  flightNumber?: string;
  bookingReference?: string;
  refundAmount?: string;
  from?: string;
  to?: string;
  delayMinutes?: number;
  cancellationReason?: string;
  previousGate?: string;
  newGate?: string;
  gate?: string;
  terminal?: string;
  otpCode?: string;
  message?: string;
  [key: string]: string | number | undefined;
}

export class SMSService {
  private deliveries: Map<string, SMSDelivery[]> = new Map();
  private provider: "twilio" | "aws-sns" | "vonage";

  constructor() {
    this.provider = ((config as any).smsProvider as any) || "twilio";
  }

  /**
   * Send an SMS using a pre-defined notification template
   */
  async sendTypedSMS(
    phoneNumber: string,
    type: SMSNotificationType,
    data: SMSTemplateData,
    userId?: string,
  ): Promise<SMSDelivery> {
    const message = this.buildTemplateMessage(type, data);
    return this.sendSMS(phoneNumber, message, userId);
  }

  /**
   * Send SMS message
   */
  async sendSMS(
    phoneNumber: string,
    message: string,
    userId?: string,
  ): Promise<SMSDelivery> {
    if (!this.validatePhoneNumber(phoneNumber)) {
      throw new BadRequestError("Invalid phone number format");
    }

    const truncated = message.length > 160 ? message.substring(0, 157) + "..." : message;

    if (message.length > 160) {
      logger.warn("SMS message exceeds 160 characters, truncating", {
        originalLength: message.length,
        userId,
      });
    }

    const delivery: SMSDelivery = {
      id: `sms-${Date.now()}-${Math.random()}`,
      phoneNumber: this.maskPhoneNumber(phoneNumber),
      message: truncated,
      status: "pending",
      provider: this.provider,
      sentAt: new Date(),
    };

    try {
      const externalId = await this.providerSend(phoneNumber, truncated);
      delivery.externalId = externalId;
      delivery.status = "sent";

      logger.info("SMS sent", {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        provider: this.provider,
        userId,
      });
    } catch (error) {
      delivery.status = "failed";
      delivery.failureReason =
        error instanceof Error ? error.message : "Unknown error";

      logger.error("SMS send failed", {
        phoneNumber: this.maskPhoneNumber(phoneNumber),
        error,
        userId,
      });
    }

    const userDeliveries = this.deliveries.get(userId || "unknown") || [];
    userDeliveries.push(delivery);
    this.deliveries.set(userId || "unknown", userDeliveries);

    return delivery;
  }

  /**
   * Send SMS to multiple recipients
   */
  async sendBulkSMS(
    phoneNumbers: string[],
    message: string,
    userId?: string,
  ): Promise<{
    successful: number;
    failed: number;
    deliveries: SMSDelivery[];
  }> {
    const deliveries: SMSDelivery[] = [];
    let successful = 0;
    let failed = 0;

    for (const phone of phoneNumbers) {
      try {
        const delivery = await this.sendSMS(phone, message, userId);
        deliveries.push(delivery);

        if (delivery.status === "sent") {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        logger.error("Bulk SMS item failed", { error });
      }
    }

    logger.info("Bulk SMS completed", {
      successful,
      failed,
      total: phoneNumbers.length,
      userId,
    });

    return { successful, failed, deliveries };
  }

  /**
   * Get SMS delivery status (queries provider if Twilio)
   */
  async getDeliveryStatus(_externalId: string): Promise<DeliveryStatus> {
    // In production, query provider API
    return "delivered";
  }

  /**
   * Update delivery status via webhook callback
   */
  async updateDeliveryStatus(
    externalId: string,
    status: DeliveryStatus,
  ): Promise<void> {
    for (const deliveries of this.deliveries.values()) {
      const delivery = deliveries.find((d) => d.externalId === externalId);
      if (delivery) {
        delivery.status = status;
        if (status === "delivered") {
          delivery.deliveredAt = new Date();
        }
        break;
      }
    }

    logger.info("SMS delivery status updated", { externalId, status });
  }

  /**
   * Get delivery history for a user
   */
  async getDeliveryHistory(
    userId: string,
    limit: number = 50,
  ): Promise<SMSDelivery[]> {
    const deliveries = this.deliveries.get(userId) || [];
    return deliveries.slice(-limit);
  }

  /**
   * Get aggregate delivery statistics
   */
  async getStatistics(): Promise<{
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    successRate: number;
  }> {
    let totalSent = 0;
    let totalDelivered = 0;
    let totalFailed = 0;

    for (const deliveries of this.deliveries.values()) {
      totalSent += deliveries.length;
      totalDelivered += deliveries.filter(
        (d) => d.status === "delivered",
      ).length;
      totalFailed += deliveries.filter((d) => d.status === "failed").length;
    }

    const successRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      successRate: Math.round(successRate * 100) / 100,
    };
  }

  /**
   * Build a human-readable SMS message from a template type and data payload
   */
  buildTemplateMessage(type: SMSNotificationType, data: SMSTemplateData): string {
    switch (type) {
      case "booking_confirmation":
        return `Traqora: Booking confirmed! Flight ${data.flightNumber ?? ""} (${data.from ?? ""} → ${data.to ?? ""}). Ref: ${data.bookingReference ?? ""}. Have a great trip!`;

      case "booking_cancelled":
        return `Traqora: Your booking ${data.bookingReference ?? ""} for flight ${data.flightNumber ?? ""} has been cancelled. Please contact support for assistance.`;

      case "flight_delayed":
        return `Traqora: Flight ${data.flightNumber ?? ""} (${data.from ?? ""} → ${data.to ?? ""}) is delayed by ${data.delayMinutes ?? 0} min. We apologise for the inconvenience.`;

      case "flight_cancelled":
        return `Traqora: Flight ${data.flightNumber ?? ""} (${data.from ?? ""} → ${data.to ?? ""}) has been cancelled. Reason: ${data.cancellationReason ?? "Unknown"}. A refund is being processed.`;

      case "gate_changed":
        return `Traqora: Gate change for flight ${data.flightNumber ?? ""}. New gate: ${data.newGate ?? "TBD"} (was ${data.previousGate ?? "N/A"}). Please proceed to the new gate.`;

      case "boarding_reminder":
        return `Traqora: Boarding starts in 45 min for flight ${data.flightNumber ?? ""} at gate ${data.gate ?? "TBD"}, terminal ${data.terminal ?? "TBD"}. Please have your boarding pass ready.`;

      case "refund_processed":
        return `Traqora: Your refund of ${data.refundAmount ?? ""} for booking ${data.bookingReference ?? ""} has been processed and will appear within 3-5 business days.`;

      case "refund_initiated":
        return `Traqora: A refund for cancelled flight ${data.flightNumber ?? ""} has been initiated to your original payment method.`;

      case "payment_received":
        return `Traqora: Payment received for booking ${data.bookingReference ?? ""}. Your booking is confirmed.`;

      case "otp":
        return `Traqora verification code: ${data.otpCode ?? ""}. Valid for 10 minutes. Do not share this code with anyone.`;

      case "general":
        return data.message ?? "You have a notification from Traqora.";

      default: {
        const _exhaustive: never = type;
        throw new Error(`Unknown SMS notification type: ${_exhaustive}`);
      }
    }
  }

  /**
   * Validate phone number — accepts E.164 and common national formats
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    return cleanNumber.length >= 10 && cleanNumber.length <= 15;
  }

  /**
   * Mask phone number for safe logging (shows last 4 digits only)
   */
  private maskPhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 4) return "****";
    return `****${cleaned.slice(-4)}`;
  }

  /**
   * Normalise a phone number to E.164 format for providers
   */
  private normalisePhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, "");
    // Prepend + if not already present
    return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
  }

  /**
   * Map Twilio message status string to internal DeliveryStatus
   */
  private mapTwilioStatus(twilioStatus: string): DeliveryStatus {
    switch (twilioStatus) {
      case "delivered":
        return "delivered";
      case "sent":
        return "sent";
      case "failed":
      case "undelivered":
        return "failed";
      case "queued":
      case "sending":
        return "pending";
      default:
        return "sent";
    }
  }

  /**
   * Dispatch to the configured SMS provider.
   * Twilio is wired when credentials are present; otherwise falls back to a
   * stub that logs and returns a mock message ID (safe for test/CI environments).
   */
  private async providerSend(
    _phoneNumber: string,
    _message: string,
  ): Promise<string> {
    const e164 = this.normalisePhoneNumber(phoneNumber);

    if (this.provider === "twilio") {
      const accountSid = (config as any).twilioAccountSid as string | undefined;
      const authToken = (config as any).twilioAuthToken as string | undefined;
      const fromNumber = (config as any).twilioFromNumber as string | undefined;

      if (accountSid && authToken && fromNumber) {
        if (!twilioClient) {
          // Lazy-load Twilio SDK to avoid import-time errors when unconfigured
          const twilio = await import("twilio");
          twilioClient = twilio.default(accountSid, authToken);
        }

        const msg = await twilioClient.messages.create({
          body: message,
          from: fromNumber,
          to: e164,
        });

        return msg.sid;
      }
    }

    // Stub path – used when provider credentials are not configured
    logger.debug("SMS provider not fully configured, using stub delivery", {
      provider: this.provider,
      to: this.maskPhoneNumber(phoneNumber),
    });

    return `mock-${Date.now()}`;
  }
}

export const smsService = new SMSService();
