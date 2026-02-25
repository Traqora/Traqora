import { notificationQueue, NotificationPayload } from "./notificationQueue";
import { AppDataSource } from "../db/dataSource";
import { UserPreference } from "../db/entities/UserPreference";
import { NotificationLog } from "../db/entities/NotificationLog";
import { emailService } from "../services/EmailService";
import { smsService } from "../services/SMSService";
import { pushNotificationService } from "../services/PushNotificationService";

export const setupNotificationWorker = () => {
  notificationQueue.process(async (job) => {
    const { userId, type, data, channels } = job.data;

    // In a real app we might fetch user details (e.g. email, phone) from a User service or entity
    // For now we rely on UserPreference storing them.
    const userPrefRepo = AppDataSource.getRepository(UserPreference);
    const logRepo = AppDataSource.getRepository(NotificationLog);

    const userPref = await userPrefRepo.findOne({ where: { userId } });

    if (!userPref) {
      throw new Error(`User preferences not found for user: ${userId}`);
    }

    const targetChannels = channels || ["email", "sms", "push"];
    const results = [];

    // Email
    if (
      targetChannels.includes("email") &&
      userPref.emailEnabled &&
      userPref.email
    ) {
      try {
        await emailService.send(userPref.email, type, data);
        const log = logRepo.create({
          userId,
          channel: "email",
          type,
          payload: job.data,
          status: "sent",
          attempts: job.attemptsMade + 1,
        });
        await logRepo.save(log);
        results.push({ channel: "email", status: "success" });
      } catch (error: any) {
        const log = logRepo.create({
          userId,
          channel: "email",
          type,
          payload: job.data,
          status: "failed",
          errorMessage: error.message,
          attempts: job.attemptsMade + 1,
        });
        await logRepo.save(log);
        results.push({
          channel: "email",
          status: "error",
          error: error.message,
        });
      }
    }

    // SMS
    if (
      targetChannels.includes("sms") &&
      userPref.smsEnabled &&
      userPref.phoneNumber
    ) {
      try {
        await smsService.send(userPref.phoneNumber, type, data);
        const log = logRepo.create({
          userId,
          channel: "sms",
          type,
          payload: job.data,
          status: "sent",
          attempts: job.attemptsMade + 1,
        });
        await logRepo.save(log);
        results.push({ channel: "sms", status: "success" });
      } catch (error: any) {
        const log = logRepo.create({
          userId,
          channel: "sms",
          type,
          payload: job.data,
          status: "failed",
          errorMessage: error.message,
          attempts: job.attemptsMade + 1,
        });
        await logRepo.save(log);
        results.push({ channel: "sms", status: "error", error: error.message });
      }
    }

    // Push
    if (
      targetChannels.includes("push") &&
      userPref.pushEnabled &&
      userPref.fcmToken
    ) {
      try {
        await pushNotificationService.send(userPref.fcmToken, type, data);
        const log = logRepo.create({
          userId,
          channel: "push",
          type,
          payload: job.data,
          status: "sent",
          attempts: job.attemptsMade + 1,
        });
        await logRepo.save(log);
        results.push({ channel: "push", status: "success" });
      } catch (error: any) {
        const log = logRepo.create({
          userId,
          channel: "push",
          type,
          payload: job.data,
          status: "failed",
          errorMessage: error.message,
          attempts: job.attemptsMade + 1,
        });
        await logRepo.save(log);
        results.push({
          channel: "push",
          status: "error",
          error: error.message,
        });
      }
    }

    // If any channel we attempted failed, we might want to throw to let Bull retry the job,
    // although this risks duplicate sends to successful channels unless we manage idempotency per channel.
    // For simplicity, we just complete the job here. A sophisticated system would retry only failed channels.
    return results;
  });

  notificationQueue.on("failed", (job, err) => {
    console.error(`Job ${job.id} failed with error: ${err.message}`);
  });

  notificationQueue.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed with result:`, result);
  });
};
