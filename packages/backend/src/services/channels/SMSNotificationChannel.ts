/**
 * SMS Notification Channel
 * Handles SMS delivery via SMS service providers
 */

import { logger } from '../../utils/logger';
import type {
  NotificationChannel,
  NotificationPayload,
} from '../../types/notification';
import type { DeliveryChannel, DeliveryResult } from '../MultiChannelNotificationService';

export interface SMSConfig {
  provider: 'twilio' | 'aws-sns' | 'vonage' | 'custom';
  apiKey?: string;
  apiSecret?: string;
  fromNumber?: string;
  region?: string;
}

export class SMSNotificationChannel implements DeliveryChannel {
  name: NotificationChannel = 'sms';
  enabled: boolean = true;
  private config: SMSConfig;

  constructor(config: SMSConfig) {
    this.config = config;
  }

  /**
   * Deliver notification via SMS
   */
  async deliver(payload: NotificationPayload, recipient: string): Promise<DeliveryResult> {
    if (!this.enabled) {
      return {
        success: false,
        status: 'failed',
        error: 'SMS channel is disabled',
      };
    }

    try {
      // Validate phone number
      if (!this.isValidPhoneNumber(recipient)) {
        return {
          success: false,
          status: 'bounced',
          error: 'Invalid phone number',
        };
      }

      // Format SMS message
      const message = this.formatMessage(payload);

      // Send SMS based on provider
      const externalId = await this.sendSMS(recipient, message);

      logger.info('SMS sent successfully', {
        recipient,
        externalId,
      });

      return {
        success: true,
        status: 'delivered',
        externalId,
        metadata: {
          recipient,
          messageLength: message.length,
        },
      };
    } catch (error) {
      logger.error('SMS delivery failed', {
        recipient,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Send SMS via configured provider
   */
  private async sendSMS(recipient: string, message: string): Promise<string> {
    switch (this.config.provider) {
      case 'twilio':
        return this.sendViaTwilio(recipient, message);
      case 'aws-sns':
        return this.sendViaSNS(recipient, message);
      case 'vonage':
        return this.sendViaVonage(recipient, message);
      default:
        return this.sendViaCustom(recipient, message);
    }
  }

  /**
   * Send via Twilio
   */
  private async sendViaTwilio(recipient: string, _message: string): Promise<string> {
    // Placeholder for Twilio integration
    // In production, use the twilio npm package
    logger.info('Twilio SMS send called', { to: recipient });
    
    return `twilio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send via AWS SNS
   */
  private async sendViaSNS(recipient: string, _message: string): Promise<string> {
    // Placeholder for AWS SNS integration
    // In production, use the AWS SDK
    logger.info('AWS SNS SMS send called', { to: recipient });
    
    return `sns-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send via Vonage (formerly Nexmo)
   */
  private async sendViaVonage(recipient: string, _message: string): Promise<string> {
    // Placeholder for Vonage integration
    // In production, use the vonage npm package
    logger.info('Vonage SMS send called', { to: recipient });
    
    return `vonage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send via custom provider
   */
  private async sendViaCustom(recipient: string, _message: string): Promise<string> {
    // Placeholder for custom SMS provider
    logger.info('Custom SMS send called', { to: recipient });
    
    return `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format SMS message (truncate to 160 chars for standard SMS)
   */
  private formatMessage(payload: NotificationPayload): string {
    let message = `${payload.title}\n${payload.body}`;
    
    if (payload.actionUrl) {
      message += `\n\n${payload.actionUrl}`;
    }

    // Truncate to 160 characters for standard SMS
    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }

    return message;
  }

  /**
   * Validate phone number (basic validation)
   */
  private isValidPhoneNumber(phone: string): boolean {
    // Basic phone number validation
    // In production, use a proper phone number validation library
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/[\s-]/g, ''));
  }

  /**
   * Enable/disable channel
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('SMS channel enabled status changed', { enabled });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SMSConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('SMS channel configuration updated');
  }
}
