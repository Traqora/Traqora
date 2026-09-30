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

/**
 * Check whether a "sent" log entry already exists for this idempotency key +
 * channel combination. Returns true when the channel should be skipped.
 */
async function isDuplicateDelivery(
  logRepo: ReturnType<typeof AppDataSource.getRepository<NotificationLog>>,
  userId: string,
  type: string,
  channel: string,
  idempotencyKey: string,
): Promise<boolean> {
  const existing = await logRepo.findOne({
    where: { userId, type, channel, idempotencyKey, status: "sent" },
  });
  return existing !== null;
}

export const setupNotificationWorker = () => {
  notificationQueue.process(async (job) => {
    const { userId, type, data, channels } = job.data;
    // Derive idempotency key from caller-supplied value or the Bull job ID so
    // that per-channel deduplication works correctly across retries.
    const idempotencyKey =
      job.data.idempotencyKey ?? `job:${job.id?.toString() ?? "unknown"}`;

    const log = createJobLogger("notification-worker", job.id?.toString() ?? undefined);
    log.start({ userId, type, idempotencyKey });

    // In a real app we might fetch user details (e.g. email, phone) from a User service or entity
    // For now we rely on UserPreference storing them.
    const userPrefRepo = AppDataSource.getRepository(UserPreference);
    const logRepo = AppDataSource.getRepository(NotificationLog);

    const userPref = await userPrefRepo.findOne({ where: { userId } });

    if (!userPref) {
      log.fail({ step: "load_user_preference", error: `User preferences not found for user: ${userId}` });
      throw new Error(`User preferences not found for user: ${userId}`);
    }
    log.step("load_user_preference");

    const targetChannels = channels || ["email", "sms", "push"];
    const results = [];

    // Email
    if (
      targetChannels.includes("email") &&
      userPref.emailEnabled &&
      userPref.email
    ) {
      if (await isDuplicateDelivery(logRepo, userId, type, "email", idempotencyKey)) {
        logger.info("notification-worker: skipping duplicate email delivery", { userId, type, idempotencyKey });
        results.push({ channel: "email", status: "skipped_duplicate" });
      } else {
        try {
          await emailService.sendTemplate(userPref.email, type, data);
          const entry = logRepo.create({
            userId,
            channel: "email",
            type,
            payload: job.data,
            status: "sent",
            attempts: job.attemptsMade + 1,
            idempotencyKey,
          });
          await logRepo.save(entry);
          results.push({ channel: "email", status: "success" });
        } catch (error: any) {
          const entry = logRepo.create({
            userId,
            channel: "email",
            type,
            payload: job.data,
            status: "failed",
            errorMessage: error.message,
            attempts: job.attemptsMade + 1,
            idempotencyKey,
          });
          await logRepo.save(entry);
          results.push({
            channel: "email",
            status: "error",
            error: error.message,
          });
        }
      }
    }

    // SMS
    if (
      targetChannels.includes("sms") &&
      userPref.smsEnabled &&
      userPref.phoneNumber
    ) {
      if (await isDuplicateDelivery(logRepo, userId, type, "sms", idempotencyKey)) {
        logger.info("notification-worker: skipping duplicate sms delivery", { userId, type, idempotencyKey });
        results.push({ channel: "sms", status: "skipped_duplicate" });
      } else {
        try {
          await smsService.sendSMS(userPref.phoneNumber, `${type}: ${JSON.stringify(data)}`, userId);
          const entry = logRepo.create({
            userId,
            channel: "sms",
            type,
            payload: job.data,
            status: "sent",
            attempts: job.attemptsMade + 1,
            idempotencyKey,
          });
          await logRepo.save(entry);
          results.push({ channel: "sms", status: "success" });
        } catch (error: any) {
          const entry = logRepo.create({
            userId,
            channel: "sms",
            type,
            payload: job.data,
            status: "failed",
            errorMessage: error.message,
            attempts: job.attemptsMade + 1,
            idempotencyKey,
          });
          await logRepo.save(entry);
          results.push({ channel: "sms", status: "error", error: error.message });
        }
      }
    }

    // Push
    if (
      targetChannels.includes("push") &&
      userPref.pushEnabled &&
      userPref.fcmToken
    ) {
      if (await isDuplicateDelivery(logRepo, userId, type, "push", idempotencyKey)) {
        logger.info("notification-worker: skipping duplicate push delivery", { userId, type, idempotencyKey });
        results.push({ channel: "push", status: "skipped_duplicate" });
      } else {
        try {
          await pushNotificationService.sendPush(userId, type, { data });
          const entry = logRepo.create({
            userId,
            channel: "push",
            type,
            payload: job.data,
            status: "sent",
            attempts: job.attemptsMade + 1,
            idempotencyKey,
          });
          await logRepo.save(entry);
          results.push({ channel: "push", status: "success" });
        } catch (error: any) {
          const entry = logRepo.create({
            userId,
            channel: "push",
            type,
            payload: job.data,
            status: "failed",
            errorMessage: error.message,
            attempts: job.attemptsMade + 1,
            idempotencyKey,
          });
          await logRepo.save(entry);
          results.push({
            channel: "push",
            status: "error",
            error: error.message,
          });
        }
      }
    }

    // Channels that already succeeded on a previous attempt are skipped rather than
    // re-sent, so only genuinely failed channels drive a Bull retry.
    const failures = results.filter((r) => r.status === "error");
    if (failures.length > 0) {
      log.step("deliver", { outcome: "failure", channels: results });
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
      // Bull will not retry this job again — quarantine it instead of letting it
      // disappear once Bull removes/expires the failed job record.
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
