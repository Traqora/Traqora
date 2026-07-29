/**
 * Email Notification Channel
 * Handles email delivery via SMTP or email service providers
 */

import { logger } from '../../utils/logger';
import type {
  NotificationChannel,
  NotificationPayload,
} from '../../types/notification';
import type { DeliveryChannel, DeliveryResult } from '../MultiChannelNotificationService';

export interface EmailConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  fromAddress: string;
  fromName: string;
  useTls?: boolean;
}

export class EmailNotificationChannel implements DeliveryChannel {
  name: NotificationChannel = 'email';
  enabled: boolean = true;
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  /**
   * Deliver notification via email
   */
  async deliver(payload: NotificationPayload, recipient: string): Promise<DeliveryResult> {
    if (!this.enabled) {
      return {
        success: false,
        status: 'failed',
        error: 'Email channel is disabled',
      };
    }

    try {
      // Validate recipient email
      if (!this.isValidEmail(recipient)) {
        return {
          success: false,
          status: 'bounced',
          error: 'Invalid email address',
        };
      }

      // Prepare email content
      const subject = this.formatSubject(payload);
      const htmlBody = this.formatHtmlBody(payload);
      const textBody = this.formatTextBody(payload);

      // Send email (placeholder for actual email service integration)
      const externalId = await this.sendEmail({
        to: recipient,
        from: `${this.config.fromName} <${this.config.fromAddress}>`,
        subject,
        html: htmlBody,
        text: textBody,
      });

      logger.info('Email sent successfully', {
        recipient,
        subject,
        externalId,
      });

      return {
        success: true,
        status: 'delivered',
        externalId,
        metadata: {
          subject,
          recipient,
        },
      };
    } catch (error) {
      logger.error('Email delivery failed', {
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
   * Send email via SMTP or email service
   * This is a placeholder - integrate with your email service (SendGrid, AWS SES, etc.)
   */
  private async sendEmail(emailData: {
    to: string;
    from: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<string> {
    // Placeholder implementation
    // In production, integrate with:
    // - Nodemailer for SMTP
    // - SendGrid API
    // - AWS SES
    // - Mailgun
    // etc.

    logger.info('Email send called', { to: emailData.to, subject: emailData.subject });

    // Simulate email sending (placeholder)
    // In production, integrate with actual email service

    return `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format email subject
   */
  private formatSubject(payload: NotificationPayload): string {
    const categoryPrefixes: Record<string, string> = {
      booking: 'Booking',
      payment: 'Payment',
      itinerary: 'Itinerary',
      collaboration: 'Collaboration',
      marketing: '',
      system: 'System',
    };

    const prefix = categoryPrefixes[payload.category] || '';
    return prefix ? `[${prefix}] ${payload.title}` : payload.title;
  }

  /**
   * Format HTML email body
   */
  private formatHtmlBody(payload: NotificationPayload): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${payload.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4f46e5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 4px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Traqora</h1>
          </div>
          <div class="content">
            <h2>${payload.title}</h2>
            <p>${payload.body}</p>
            ${payload.actionUrl ? `<a href="${payload.actionUrl}" class="button">View Details</a>` : ''}
          </div>
          <div class="footer">
            <p>You received this email because you have notifications enabled for ${payload.category} updates.</p>
            <p>&copy; ${new Date().getFullYear()} Traqora. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Format plain text email body
   */
  private formatTextBody(payload: NotificationPayload): string {
    let text = `${payload.title}\n\n`;
    text += `${payload.body}\n\n`;
    
    if (payload.actionUrl) {
      text += `View Details: ${payload.actionUrl}\n\n`;
    }
    
    text += `---\n`;
    text += `Traqora\n`;
    text += `You received this email because you have notifications enabled for ${payload.category} updates.\n`;
    text += `© ${new Date().getFullYear()} Traqora. All rights reserved.`;

    return text;
  }

  /**
   * Validate email address
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Enable/disable channel
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info('Email channel enabled status changed', { enabled });
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<EmailConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Email channel configuration updated');
  }
}
