import sgMail from "@sendgrid/mail";
import { config } from "../config";
import { logger } from "../utils/logger";
import * as templatesV1 from "../templates/emails/v1";

function resolveTemplate(type: string, data: any) {
  switch (type) {
    case "booking":
      return templatesV1.bookingTemplate(data);
    case "reminder":
      return templatesV1.reminderTemplate(data);
    case "refund":
    case "refund_initiated":
      return templatesV1.refundTemplate({
        bookingReference: data?.bookingReference ?? data?.bookingId ?? "N/A",
        refundAmount:
          data?.refundAmount ?? data?.amount ?? data?.approvedAmountCents ?? "pending",
      });
    case "payment":
      return templatesV1.paymentTemplate(data);
    case "flight_status":
    case "flight_delayed":
    case "flight_delayed_significant":
    case "flight_cancelled":
    case "gate_changed":
    case "boarding_reminder":
    case "flight_status_shared":
      return templatesV1.flightStatusTemplate({
        flightNumber: data?.flightNumber ?? data?.flight?.flightNumber,
        status:
          data?.status ??
          data?.changeType ??
          (type === "flight_delayed" || type === "flight_delayed_significant"
            ? "delayed"
            : type === "flight_cancelled"
              ? "cancelled"
              : type === "gate_changed"
                ? "gate changed"
                : type === "boarding_reminder"
                  ? "boarding"
                  : "updated"),
        reason: data?.reason ?? data?.cancellationReason,
      });
    default:
      throw new Error(`Email template not found for type: ${type}`);
  }
}

class EmailService {
  private senderEmail: string;

  constructor() {
    if (config.sendgridApiKey) {
      sgMail.setApiKey(config.sendgridApiKey);
    }
    this.senderEmail = "noreply@traqora.com";
  }

  /**
   * Typed transactional send (queue/worker path): send(to, type, data)
   * Legacy direct send (deprecated): send({ to, subject, html/text })
   */
  public async send(toOrOptions: any, type?: string, data?: any): Promise<any> {
    // Legacy/deprecated direct-send compatibility
    if (typeof toOrOptions === "object" && toOrOptions !== null && !type) {
      const legacy = toOrOptions as { to: string; subject?: string; html?: string; text?: string };
      if (!config.sendgridApiKey) {
        logger.warn("email: legacy send skipped due to missing provider configuration", {
          channel: "email",
          hasRecipient: Boolean(legacy?.to),
        });
        return false;
      }
      const msg = {
        to: legacy.to,
        from: this.senderEmail,
        subject: legacy.subject || "Traqora notification",
        text: legacy.text || legacy.html || "",
        html: legacy.html || legacy.text || "",
      };
      try {
        await sgMail.send(msg as any);
        logger.info("email: legacy sent", { channel: "email" });
        return true;
      } catch (error: any) {
        const providerError = error?.response?.body?.errors?.[0]?.message || error?.message || "Unknown SendGrid error";
        logger.error("email: legacy provider send failed", {
          channel: "email",
          error: providerError,
          statusCode: error?.code || error?.response?.statusCode,
        });
        throw new Error(`Email delivery failed: ${providerError}`);
      }
    }

    const to = String(toOrOptions);
    const messageType = String(type);

    if (!config.sendgridApiKey) {
      const error = new Error("Transactional email provider not configured (SENDGRID_API_KEY missing)");
      logger.error("email: delivery skipped due to missing provider configuration", {
        channel: "email",
        type: messageType,
        hasRecipient: Boolean(to),
        error: error.message,
      });
      throw error;
    }

    let template;
    try {
      template = resolveTemplate(messageType, data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("email: template resolution failed", { channel: "email", type: messageType, error: message });
      throw error;
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
      logger.info("email: sent", { channel: "email", type: messageType });
    } catch (error: any) {
      const providerError = error?.response?.body?.errors?.[0]?.message || error?.message || "Unknown SendGrid error";
      logger.error("email: provider send failed", {
        channel: "email",
        type: messageType,
        error: providerError,
        statusCode: error?.code || error?.response?.statusCode,
      });
      throw new Error(`Email delivery failed: ${providerError}`);
    }
  }
}

export const emailService = new EmailService();
