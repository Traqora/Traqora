import { notificationQueue } from "./notificationQueue";
import { AppDataSource } from "../db/dataSource";
import { UserPreference } from "../db/entities/UserPreference";
import { NotificationLog } from "../db/entities/NotificationLog";
import { emailService } from "../services/EmailService";
import { smsService } from "../services/SMSService";
import { pushNotificationService } from "../services/PushNotificationService";
import { logger } from "../utils/logger";
import { createJobLogger } from "./jobLogger";
import { deadLetterQueue } from "./deadLetterQueue";

type DeliveryChannel = "email" | "sms" | "push";

type ChannelOutcome = {
  channel: DeliveryChannel;
  status: "success" | "skipped_duplicate" | "error";
  error?: string;
};

async function isDuplicateDelivery(
  logRepo: ReturnType<typeof AppDataSource.getRepository<NotificationLog>>,
  userId: string,
  type: string,
  channel: DeliveryChannel,
  idempotencyKey: string,
): Promise<boolean> {
  const existing = await logRepo.findOne({
    where: { userId, type, channel, idempotencyKey, status: "sent" },
  });
  return existing !== null;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown notification delivery error";
  }
}

function isPushTypeEnabled(userPref: UserPreference, type: string): boolean {
  if (type === "booking") return userPref.pushBookingEnabled;
  if (type === "reminder") return userPref.pushReminderEnabled;
  if (type === "refund" || type === "refund_initiated") return userPref.pushRefundEnabled;
  if (type === "promotional") return userPref.pushPromoEnabled;
  return true;
}

function toPushDeliveryType(type: string): string {
  if (type === "promotional") return "marketing";
  if (type === "flight_status_shared") return "flight_status";
  if (type === "payment") return "payment";
  return type;
}

async function recordDelivery(
  logRepo: ReturnType<typeof AppDataSource.getRepository<NotificationLog>>,
  params: {
    userId: string;
    channel: DeliveryChannel;
    type: string;
    payload: Record<string, unknown>;
    status: "sent" | "failed";
    attempts: number;
    idempotencyKey: string;
    errorMessage?: string;
  },
): Promise<void> {
  const entry = logRepo.create({
    userId: params.userId,
    channel: params.channel,
    type: params.type,
    payload: params.payload,
    status: params.status,
    attempts: params.attempts,
    idempotencyKey: params.idempotencyKey,
    errorMessage: params.errorMessage,
  });
  await logRepo.save(entry);
}

export const setupNotificationWorker = () => {
  notificationQueue.process(async (job) => {
    const { userId, type, data, channels } = job.data;
    const idempotencyKey =
      job.data.idempotencyKey ?? `job:${job.id?.toString() ?? "unknown"}`;

    const log = createJobLogger("notification-worker", job.id?.toString() ?? undefined);
    log.start({ userId, type, idempotencyKey });

    const userPrefRepo = AppDataSource.getRepository(UserPreference);
    const logRepo = AppDataSource.getRepository(NotificationLog);

    const userPref = await userPrefRepo.findOne({ where: { userId } });
    if (!userPref) {
      const error = `User preferences not found for user: ${userId}`;
      log.fail({ step: "load_user_preference", error });
      throw new Error(error);
    }
    log.step("load_user_preference");

    const targetChannels: DeliveryChannel[] = (channels?.length
      ? channels
      : ["email", "sms", "push"]) as DeliveryChannel[];
    const results: ChannelOutcome[] = [];
    const attempts = job.attemptsMade + 1;

    for (const channel of targetChannels) {
      const baseLog = { userId, channel, type, idempotencyKey };

      if (await isDuplicateDelivery(logRepo, userId, type, channel, idempotencyKey)) {
        logger.info("notification-worker: skipping duplicate delivery", baseLog);
        results.push({ channel, status: "skipped_duplicate" });
        continue;
      }

      if (channel === "email") {
        if (!userPref.emailEnabled || !userPref.email) {
          continue;
        }
        try {
          await emailService.send(userPref.email, type, data ?? {});
          await recordDelivery(logRepo, {
            userId,
            channel,
            type,
            payload: job.data as Record<string, unknown>,
            status: "sent",
            attempts,
            idempotencyKey,
          });
          results.push({ channel, status: "success" });
        } catch (error) {
          const message = safeErrorMessage(error);
          logger.error("notification-worker: email delivery failed", { ...baseLog, error: message });
          await recordDelivery(logRepo, {
            userId,
            channel,
            type,
            payload: job.data as Record<string, unknown>,
            status: "failed",
            attempts,
            idempotencyKey,
            errorMessage: message,
          }).catch((persistError) => {
            logger.error("notification-worker: failed to persist email delivery error", {
              ...baseLog,
              error: safeErrorMessage(persistError),
            });
          });
          results.push({ channel, status: "error", error: message });
        }
        continue;
      }

      if (channel === "sms") {
        if (!userPref.smsEnabled || !userPref.phoneNumber) {
          continue;
        }
        try {
          await smsService.send(userPref.phoneNumber, type, data ?? {});
          await recordDelivery(logRepo, {
            userId,
            channel,
            type,
            payload: job.data as Record<string, unknown>,
            status: "sent",
            attempts,
            idempotencyKey,
          });
          results.push({ channel, status: "success" });
        } catch (error) {
          const message = safeErrorMessage(error);
          logger.error("notification-worker: sms delivery failed", { ...baseLog, error: message });
          await recordDelivery(logRepo, {
            userId,
            channel,
            type,
            payload: job.data as Record<string, unknown>,
            status: "failed",
            attempts,
            idempotencyKey,
            errorMessage: message,
          }).catch((persistError) => {
            logger.error("notification-worker: failed to persist sms delivery error", {
              ...baseLog,
              error: safeErrorMessage(persistError),
            });
          });
          results.push({ channel, status: "error", error: message });
        }
        continue;
      }

      if (channel === "push") {
        const enabled = userPref.pushEnabled && userPref.pushOptedIn && isPushTypeEnabled(userPref, type);
        if (!enabled) {
          continue;
        }
        try {
          const delivery = await pushNotificationService.sendTypedPush(
            userId,
            toPushDeliveryType(type) as any,
            (data ?? {}) as Record<string, any>,
          );
          if (delivery.failed > 0) {
            throw new Error(`Push delivery failed for ${delivery.failed} device(s)`);
          }
          await recordDelivery(logRepo, {
            userId,
            channel,
            type,
            payload: job.data as Record<string, unknown>,
            status: "sent",
            attempts,
            idempotencyKey,
          });
          results.push({ channel, status: "success" });
        } catch (error) {
          const message = safeErrorMessage(error);
          logger.error("notification-worker: push delivery failed", { ...baseLog, error: message });
          await recordDelivery(logRepo, {
            userId,
            channel,
            type,
            payload: job.data as Record<string, unknown>,
            status: "failed",
            attempts,
            idempotencyKey,
            errorMessage: message,
          }).catch((persistError) => {
            logger.error("notification-worker: failed to persist push delivery error", {
              ...baseLog,
              error: safeErrorMessage(persistError),
            });
          });
          results.push({ channel, status: "error", error: message });
        }
      }
    }

    const failures = results.filter((r) => r.status === "error");
    if (failures.length > 0) {
      const error = new Error(
        `Failed to send notification via ${failures.map((failure) => failure.channel).join(", ")}`,
      );
      log.fail({ step: "deliver", error: error.message, channels: results });
      throw error;
    }

    log.complete({ channels: results });
    return results;
  });

  notificationQueue.on("failed", (job, err) => {
    logger.error("notification-worker: job failed", {
      job: "notification-worker",
      jobId: job.id,
      step: "failed",
      outcome: "failure",
      error: err.message,
    });

    const maxAttempts = job.opts?.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts;

    if (isFinalAttempt) {
      deadLetterQueue
        .add({
          id: job.id?.toString() ?? "unknown",
          queue: "notification-worker",
          type: job.data?.type,
          data: job.data,
          attempts: job.attemptsMade,
          error: err.message,
        })
        .catch((dlqError: unknown) => {
          logger.error("notification-worker: failed to write to dead-letter queue", {
            job: "notification-worker",
            jobId: job.id,
            step: "dead_letter",
            outcome: "failure",
            error: dlqError instanceof Error ? dlqError.message : String(dlqError),
          });
        });
    }
  });

  notificationQueue.on("completed", (job, result) => {
    logger.info("notification-worker: job completed", {
      job: "notification-worker",
      jobId: job.id,
      step: "complete",
      outcome: "success",
      result,
    });
  });
};
