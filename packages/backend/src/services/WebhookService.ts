import axios from "axios";
import crypto from "crypto";
import { AppDataSource } from "../db/dataSource";
import { UserPreference } from "../db/entities/UserPreference";
import { NotificationLog } from "../db/entities/NotificationLog";
import { logger } from "../utils/logger";
import { withRetries } from "./retry";
import {
  SIGNATURE_HEADER,
  getWebhookSecret,
  signWebhook,
} from "../middleware/webhookVerification";

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  /** Unique per-delivery value used for replay protection (issue #599). */
  nonce?: string;
}

export class WebhookService {
  private static instance: WebhookService;

  public static getInstance(): WebhookService {
    if (!WebhookService.instance) {
      WebhookService.instance = new WebhookService();
    }
    return WebhookService.instance;
  }

  public async sendWebhook(userId: string, eventType: string, payloadData: any) {
    const userPrefRepo = AppDataSource.getRepository(UserPreference);
    const pref = await userPrefRepo.findOne({ where: { userId } });

    if (!pref || !pref.webhookEnabled || !pref.webhookUrl) {
      logger.debug(`Webhook not enabled or URL missing for user ${userId}`);
      return;
    }

    // Replay protection: every delivery carries a fresh nonce and an
    // HMAC signature covering timestamp + nonce + body (issue #599).
    const secret = getWebhookSecret();
    const nonce = crypto.randomUUID();
    const payload: WebhookPayload = {
      event: eventType,
      data: payloadData,
      timestamp: new Date().toISOString(),
      nonce,
    };
    const rawBody = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (secret) {
      headers[SIGNATURE_HEADER] = signWebhook(rawBody, secret, {
        timestamp: payload.timestamp,
        nonce,
      }).header;
    } else {
      logger.warn(
        "webhook: no signing secret configured; delivering unsigned payload"
      );
    }

    const logRepo = AppDataSource.getRepository(NotificationLog);
    const logEntry = logRepo.create({
      userId,
      channel: "webhook",
      type: eventType,
      payload,
      status: "pending",
      attempts: 0,
    });
    await logRepo.save(logEntry);

    try {
      await withRetries(
        async () => {
          logEntry.attempts += 1;
          await axios.post(pref.webhookUrl, rawBody, {
            headers,
            timeout: 5000,
          });
        },
        { retries: 3, baseDelayMs: 1000 }
      );

      logEntry.status = "sent";
      await logRepo.save(logEntry);
      logger.info(`Webhook sent successfully to ${pref.webhookUrl} for event ${eventType}`);
    } catch (error: any) {
      logEntry.status = "failed";
      logEntry.errorMessage = error.message || "Unknown error";
      await logRepo.save(logEntry);
      logger.error(`Webhook delivery failed to ${pref.webhookUrl} for event ${eventType}`, {
        error: error.message,
      });
    }
  }
}

export const webhookService = WebhookService.getInstance();
