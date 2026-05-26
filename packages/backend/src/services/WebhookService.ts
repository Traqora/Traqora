import axios from "axios";
import { AppDataSource } from "../db/dataSource";
import { UserPreference } from "../db/entities/UserPreference";
import { NotificationLog } from "../db/entities/NotificationLog";
import { logger } from "../utils/logger";
import { withRetries } from "./retry";

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
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

    const payload: WebhookPayload = {
      event: eventType,
      data: payloadData,
      timestamp: new Date().toISOString(),
    };

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
          await axios.post(pref.webhookUrl, payload, {
            headers: {
              "Content-Type": "application/json",
              // Could add signature headers here later
            },
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
