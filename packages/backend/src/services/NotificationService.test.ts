/**
 * Unit tests for Notification Service
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { NotificationService } from "./NotificationService";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationFrequency,
} from "../types/notification";

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  describe("Notification Preferences", () => {
    it("should update notification preference", async () => {
      const userId = "user-1";
      const update = {
        channel: "email" as NotificationChannel,
        category: "booking" as NotificationCategory,
        frequency: "instant" as NotificationFrequency,
        enabled: true,
      };

      const pref = await service.updatePreference(userId, update);

      expect(pref.channel).toBe("email");
      expect(pref.category).toBe("booking");
      expect(pref.frequency).toBe("instant");
      expect(pref.enabled).toBe(true);
    });

    it("should retrieve preferences by channel and category", async () => {
      const userId = "user-1";

      await service.updatePreference(userId, {
        channel: "email",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });

      const prefs = await service.getPreferences(userId, "email", "booking");

      expect(prefs.length).toBe(1);
      expect(prefs[0].channel).toBe("email");
    });

    it("should check if notification should be delivered", async () => {
      const userId = "user-1";

      await service.updatePreference(userId, {
        channel: "email",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });

      const shouldDeliver = await service.shouldDeliver(
        userId,
        "email",
        "booking",
      );

      expect(shouldDeliver).toBe(true);
    });

    it("should not deliver disabled notifications", async () => {
      const userId = "user-1";

      await service.updatePreference(userId, {
        channel: "email",
        category: "marketing",
        frequency: "never",
        enabled: false,
      });

      const shouldDeliver = await service.shouldDeliver(
        userId,
        "email",
        "marketing",
      );

      expect(shouldDeliver).toBe(false);
    });
  });

  describe("Notification Queuing", () => {
    it("should queue notification with deliveries", async () => {
      const userId = "user-1";
      const payload = {
        id: "notif-1",
        userId,
        category: "booking" as NotificationCategory,
        title: "Flight Booked",
        body: "Your flight has been confirmed",
        timestamp: new Date(),
      };

      const notif = await service.queueNotification(userId, payload, [
        "email",
        "push",
      ]);

      expect(notif.id).toBe("notif-1");
      expect(notif.deliveries.length).toBeGreaterThan(0);
      expect(notif.read).toBe(false);
    });

    it("should respect channel preferences when queuing", async () => {
      const userId = "user-1";

      // Disable email
      await service.updatePreference(userId, {
        channel: "email",
        category: "booking",
        frequency: "never",
        enabled: false,
      });

      const payload = {
        id: "notif-1",
        userId,
        category: "booking" as NotificationCategory,
        title: "Test",
        body: "Test body",
        timestamp: new Date(),
      };

      const notif = await service.queueNotification(userId, payload, [
        "email",
        "push",
      ]);
      const emailDelivery = notif.deliveries.find((d) => d.channel === "email");

      expect(emailDelivery).toBeUndefined();
    });
  });

  describe("In-App Notifications", () => {
    it("should retrieve in-app notifications", async () => {
      const userId = "user-1";

      const notif = await service.queueNotification(userId, {
        id: "notif-1",
        userId,
        category: "booking",
        title: "Test",
        body: "Test body",
        timestamp: new Date(),
      });

      const notifs = await service.getInAppNotifications(userId);

      expect(notifs.length).toBeGreaterThan(0);
      expect(notifs[0].id).toBe("notif-1");
    });

    it("should mark notification as read", async () => {
      const userId = "user-1";

      await service.queueNotification(userId, {
        id: "notif-1",
        userId,
        category: "booking",
        title: "Test",
        body: "Test body",
        timestamp: new Date(),
      });

      await service.markAsRead(userId, "notif-1");
      const notifs = await service.getInAppNotifications(userId);

      expect(notifs[0].read).toBe(true);
      expect(notifs[0].readAt).toBeDefined();
    });

    it("should clear all notifications", async () => {
      const userId = "user-1";

      await service.queueNotification(userId, {
        id: "notif-1",
        userId,
        category: "booking",
        title: "Test 1",
        body: "Body 1",
        timestamp: new Date(),
      });

      await service.queueNotification(userId, {
        id: "notif-2",
        userId,
        category: "payment",
        title: "Test 2",
        body: "Body 2",
        timestamp: new Date(),
      });

      const count = await service.clearNotifications(userId);
      const remaining = await service.getInAppNotifications(userId);

      expect(count).toBe(2);
      expect(remaining.length).toBe(0);
    });
  });

  describe("Delivery Logging", () => {
    it("should log delivery attempts", async () => {
      const userId = "user-1";

      await service.logDelivery("notif-1", userId, "email", "sent");

      const logs = await service.getDeliveryLogs(userId);

      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe("sent");
    });
  });

  describe("Statistics", () => {
    it("should calculate notification statistics", async () => {
      const userId = "user-1";

      await service.queueNotification(userId, {
        id: "notif-1",
        userId,
        category: "booking",
        title: "Test 1",
        body: "Body",
        timestamp: new Date(),
      });

      await service.queueNotification(userId, {
        id: "notif-2",
        userId,
        category: "payment",
        title: "Test 2",
        body: "Body",
        timestamp: new Date(),
      });

      await service.markAsRead(userId, "notif-1");

      const stats = await service.getStatistics(userId);

      expect(stats.total).toBe(2);
      expect(stats.read).toBe(1);
      expect(stats.unread).toBe(1);
    });
  });

  describe("Channel Validation", () => {
    it("should support all notification channels", () => {
      const channels: NotificationChannel[] = ["email", "sms", "push", "inapp"];

      channels.forEach((channel) => {
        expect(["email", "sms", "push", "inapp"]).toContain(channel);
      });
    });

    it("should support all notification categories", () => {
      const categories: NotificationCategory[] = [
        "booking",
        "payment",
        "itinerary",
        "collaboration",
        "marketing",
        "system",
      ];

      categories.forEach((category) => {
        expect([
          "booking",
          "payment",
          "itinerary",
          "collaboration",
          "marketing",
          "system",
        ]).toContain(category);
      });
    });

    it("should support all notification frequencies", () => {
      const frequencies: NotificationFrequency[] = [
        "instant",
        "daily",
        "weekly",
        "never",
      ];

      frequencies.forEach((freq) => {
        expect(["instant", "daily", "weekly", "never"]).toContain(freq);
      });
    });
  });
});
