import twilio from 'twilio';
import { config } from '../config';

class SMSService {
  private client: twilio.Twilio | null = null;
  private fromPhoneNumber: string;

  constructor() {
    if (config.twilioAccountSid && config.twilioAuthToken) {
      this.client = twilio(config.twilioAccountSid, config.twilioAuthToken);
    }
    this.fromPhoneNumber = config.twilioPhoneNumber;
  }

  public async send(to: string, type: string, data: any) {
    if (!this.client) {
      console.warn('Twilio credentials not configured. Skipping SMS send.');
      return;
    }

    let messageBody = '';
    // Basic text generation for SMS
    switch (type) {
      case 'booking':
        messageBody = \`Traqora: Booking Confirmed! Ref: \${data.bookingReference}, Flight: \${data.flightNumber}\`;
        break;
      case 'reminder':
        messageBody = \`Traqora Reminder: Flight \${data.flightNumber} departs in 24h. Check in now!\`;
        break;
      case 'refund':
        messageBody = \`Traqora: Refund of \${data.refundAmount} for booking \${data.bookingReference} processed.\`;
        break;
      default:
        throw new Error(\`SMS message type not found for type: \${type}\`);
    }

    try {
      await this.client.messages.create({
        body: messageBody,
        from: this.fromPhoneNumber,
        to,
      });
      console.log(\`SMS sent successfully to \${to} for type \${type}\`);
    } catch (error: any) {
      console.error('Error sending SMS:', error.message);
      throw error;
    }
  }
}

export const smsService = new SMSService();
