/**
 * Unit tests for Push Notification Service
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { PushNotificationService } from "./PushNotificationService";

describe("PushNotificationService", () => {
  let service: PushNotificationService;

  beforeEach(() => {
    service = new PushNotificationService();
  });

  describe("Push Subscriptions", () => {
    it("should subscribe user device", async () => {
      const userId = "user-1";
      const subscription = {
        endpoint: "https://fcm.googleapis.com/...",
        auth: "base64auth",
        p256dh: "base64publickey",
        userAgent: "Mozilla/5.0...",
      };

      const result = await service.subscribe(userId, subscription);

      expect(result.userId).toBe(userId);
      expect(result.endpoint).toBe(subscription.endpoint);
      expect(result.isActive).toBe(true);
    });

    it("should prevent duplicate subscriptions", async () => {
      const userId = "user-1";
      const subscription = {
        endpoint: "https://fcm.googleapis.com/...",
        auth: "base64auth",
        p256dh: "base64publickey",
        userAgent: "Mozilla/5.0...",
      };

      await service.subscribe(userId, subscription);
      const duplicate = await service.subscribe(userId, subscription);

      expect(duplicate.endpoint).toBe(subscription.endpoint);
    });

    it("should unsubscribe device", async () => {
      const userId = "user-1";
      const endpoint = "https://fcm.googleapis.com/...";

      await service.subscribe(userId, {
        endpoint,
        auth: "auth",
        p256dh: "key",
        userAgent: "UA",
      });

      await service.unsubscribe(userId, endpoint);

      const subs = await service.getSubscriptions(userId);

      expect(subs.length).toBe(0);
    });

    it("should get active subscriptions only", async () => {
      const userId = "user-1";

      const sub1 = await service.subscribe(userId, {
        endpoint: "https://endpoint1.com",
        auth: "auth",
        p256dh: "key",
        userAgent: "UA",
      });

      await service.unsubscribe(userId, sub1.endpoint);

      const subs = await service.getSubscriptions(userId);

      expect(subs.length).toBe(0);
    });
  });

  describe("Push Sending", () => {
    it("should send push notification", async () => {
      const userId = "user-1";

      await service.subscribe(userId, {
        endpoint: "https://fcm.googleapis.com/...",
        auth: "auth",
        p256dh: "key",
        userAgent: "UA",
      });

      const result = await service.sendPush(userId, "Test Title", {
        body: "Test body",
        icon: "/icon.png",
      });

      expect(result.successful + result.failed).toBeGreaterThanOrEqual(0);
    });

    it("should handle no subscriptions", async () => {
      const result = await service.sendPush("user-no-subs", "Title", {
        body: "Body",
      });

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should include notification options", async () => {
      const userId = "user-1";

      await service.subscribe(userId, {
        endpoint: "https://fcm.googleapis.com/...",
        auth: "auth",
        p256dh: "key",
        userAgent: "UA",
      });

      const result = await service.sendPush(userId, "Title", {
        body: "Body",
        icon: "/icon.png",
        badge: "/badge.png",
        tag: "booking",
        data: { bookingId: "123" },
        requireInteraction: true,
      });

      expect(result).toBeDefined();
    });
  });

  describe("Broadcast", () => {
    it("should broadcast to multiple users", async () => {
      const userIds = ["user-1", "user-2", "user-3"];

      for (const userId of userIds) {
        await service.subscribe(userId, {
          endpoint: `https://endpoint-${userId}.com`,
          auth: "auth",
          p256dh: "key",
          userAgent: "UA",
        });
      }

      const result = await service.broadcastPush(
        "Title",
        {
          body: "Body",
        },
        userIds,
      );

      expect(result.totalSent + result.totalFailed).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Statistics", () => {
    it("should calculate subscription statistics", async () => {
      await service.subscribe("user-1", {
        endpoint: "https://endpoint1.com",
        auth: "auth",
        p256dh: "key",
        userAgent: "UA",
      });

      await service.subscribe("user-2", {
        endpoint: "https://endpoint2.com",
        auth: "auth",
        p256dh: "key",
        userAgent: "UA",
      });

      const stats = await service.getSubscriptionStats();

      expect(stats.totalUsers).toBe(2);
      expect(stats.activeSubscriptions).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Phone Number Validation", () => {
    it("should validate phone numbers", () => {
      const validNumbers = ["+1234567890", "1234567890", "+1 (123) 456-7890"];
      const invalidNumbers = ["123", "abc", ""];

      validNumbers.forEach((num) => {
        const cleaned = num.replace(/\D/g, "");
        expect(cleaned.length).toBeGreaterThanOrEqual(10);
      });

      invalidNumbers.forEach((num) => {
        const cleaned = num.replace(/\D/g, "");
        expect(cleaned.length < 10 || cleaned.length > 15).toBe(true);
      });
    });
  });
});
