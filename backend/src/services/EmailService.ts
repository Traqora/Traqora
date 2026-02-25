import sgMail from "@sendgrid/mail";
import { config } from "../../config";
import * as templatesV1 from "../../templates/emails/v1";

class EmailService {
  private senderEmail: string;

  constructor() {
    if (config.sendgridApiKey) {
      sgMail.setApiKey(config.sendgridApiKey);
    }
    this.senderEmail = "noreply@traqora.com"; // Should Ideally come from config
  }

  public async send(to: string, type: string, data: any) {
    if (!config.sendgridApiKey) {
      console.warn("SendGrid API key not configured. Skipping email send.");
      return;
    }

    let template;
    // Basic versioning routing
    switch (type) {
      case "booking":
        template = templatesV1.bookingTemplate(data);
        break;
      case "reminder":
        template = templatesV1.reminderTemplate(data);
        break;
      case "refund":
        template = templatesV1.refundTemplate(data);
        break;
      default:
        throw new Error(`Email template not found for type: ${type}`);
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
