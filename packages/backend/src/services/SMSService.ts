/**
 * SMS Notification Service
 * Handles SMS delivery via Twilio, AWS SNS, or Vonage
 */

import { logger } from "../utils/logger";
import { BadRequestError } from "../utils/errors";
import { config } from "../config";
import type { SMSDelivery, DeliveryStatus } from "../types/notification";

export class SMSService {
  private deliveries: Map<string, SMSDelivery[]> = new Map();
  private provider: "twilio" | "aws-sns" | "vonage" = "twilio";

  constructor() {
    this.provider = (config.smsProvider as any) || "twilio";
  }

  /**
   * Send SMS message
   */
  async sendSMS(
    phoneNumber: string,
    message: string,
    userId?: string,
  ): Promise<SMSDelivery> {
    // Validate phone number
    if (!this.validatePhoneNumber(phoneNumber)) {
      throw new BadRequestError("Invalid phone number format");
    }

    // Check message length
    if (message.length > 160) {
      logger.warn("SMS message exceeds 160 characters", {
        length: message.length,
        userId,
      });
    }

    const delivery: SMSDelivery = {
      id: `sms-${Date.now()}-${Math.random()}`,
      phoneNumber: this.maskPhoneNumber(phoneNumber),
      message: message.substring(0, 160),
      status: "pending",
      provider: this.provider,
      sentAt: new Date(),
    };

    try {
      // Simulate sending (replace with actual provider)
      const externalId = await this.providerSend(phoneNumber, message);

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

    // Store delivery record
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
   * Get SMS delivery status
   */
  async getDeliveryStatus(externalId: string): Promise<DeliveryStatus> {
    // In production, query provider API
    return "delivered";
  }

  /**
   * Update delivery status via webhook
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
   * Get delivery history
   */
  async getDeliveryHistory(
    userId: string,
    limit: number = 50,
  ): Promise<SMSDelivery[]> {
    const deliveries = this.deliveries.get(userId) || [];
    return deliveries.slice(-limit);
  }

  /**
   * Get delivery statistics
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
   * Validate phone number format
   */
  private validatePhoneNumber(phoneNumber: string): boolean {
    // Accept formats: +1234567890, 1234567890, +1 (123) 456-7890, etc.
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    return cleanNumber.length >= 10 && cleanNumber.length <= 15;
  }

  /**
   * Mask phone number for logging
   */
  private maskPhoneNumber(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, "");
    if (cleaned.length < 4) return "****";
    return `****${cleaned.slice(-4)}`;
  }

  /**
   * Send via provider (Twilio, AWS SNS, Vonage)
   */
  private async providerSend(
    phoneNumber: string,
    message: string,
  ): Promise<string> {
    // Simulate provider call
    return `mock-${Date.now()}`;
  }
}

export const smsService = new SMSService();
