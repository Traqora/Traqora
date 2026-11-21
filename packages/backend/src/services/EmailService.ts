import sgMail from "@sendgrid/mail";
import { config } from "../config";
import * as templatesV1 from "../templates/emails/v1";
import type { BookingLifecycleEvent } from "../templates/emails/v1";

class EmailService {
  private senderEmail: string;

  constructor() {
    if (config.sendgridApiKey) {
      sgMail.setApiKey(config.sendgridApiKey);
    }
    this.senderEmail = "noreply@traqora.com"; // Should ideally come from config
  }

  private toLifecycleEvent(type: string): BookingLifecycleEvent | null {
    switch (type) {
      case "booking":
        return "confirmation";
      case "refund":
        return "refund";
      case "confirmation":
      case "pending":
      case "schedule-change":
      case "cancellation":
        return type;
      default:
        return null;
    }
  }

  public async send(to: string, type: string, data: any) {
    if (!config.sendgridApiKey) {
      console.warn("SendGrid API key not configured. Skipping email send.");
      return;
    }

    let template;
    // Basic versioning routing. "booking", "reminder" and "refund" are the
    // legacy type names; the lifecycle event names are preferred.
    const lifecycleEvent = this.toLifecycleEvent(type);
    if (lifecycleEvent) {
      template = templatesV1.BOOKING_LIFECYCLE_TEMPLATES[lifecycleEvent](data);
    } else {
      switch (type) {
        case "reminder":
          template = templatesV1.reminderTemplate(data);
          break;
        default:
          throw new Error(`Email template not found for type: ${type}`);
      }
    }

    const msg = {
      to,
      from: this.senderEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    try {
      await sgMail.send(msg);
      console.log(`Email sent successfully to ${to} for type ${type}`);
    } catch (error: any) {
      console.error(
        "Error sending email:",
        error.response?.body || error.message,
      );
      throw error;
    }
  }
}

export const emailService = new EmailService();
