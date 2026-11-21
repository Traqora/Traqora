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
   * Dispatch to the configured SMS provider.
   * Twilio is wired when credentials are present; otherwise falls back to a
   * stub that logs and returns a mock message ID (safe for test/CI environments).
   */
  private async providerSend(
    phoneNumber: string,
    message: string,
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

    try {
      await this.client.messages.create({
        body: messageBody,
        from: this.fromPhoneNumber,
        to,
      });
      console.log(`SMS sent successfully to ${to} for type ${type}`);
    } catch (error: any) {
      console.error('Error sending SMS:', error.message);
      throw error;
    }
  }
}

export const smsService = new SMSService();
