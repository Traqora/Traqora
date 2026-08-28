/**
 * Unit tests for Notification Service
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { NotificationService } from "./NotificationService";
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationFrequency,
} from "../types/notification";

// ---------------------------------------------------------------------------
// Silence the sub-service imports so tests run without SMTP/Twilio credentials
// ---------------------------------------------------------------------------
jest.mock("./EmailService", () => ({
  emailService: { send: jest.fn().mockResolvedValue(true) },
}));
jest.mock("./SMSService", () => ({
  smsService: {
    sendSMS: jest
      .fn()
      .mockResolvedValue({ id: "sms-1", status: "sent", phoneNumber: "****1234" }),
  },
}));
jest.mock("./PushNotificationService", () => ({
  pushNotificationService: {
    sendPush: jest.fn().mockResolvedValue({ successful: 1, failed: 0 }),
  },
}));

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    // Fresh instance per test — avoids cross-test state leakage
    service = new NotificationService();
  });

  // -------------------------------------------------------------------------
  // Preferences
  // -------------------------------------------------------------------------

  describe("Notification Preferences", () => {
    it("should create a new preference", async () => {
      const pref = await service.updatePreference("user-1", {
        channel: "email" as NotificationChannel,
        category: "booking" as NotificationCategory,
        frequency: "instant" as NotificationFrequency,
        enabled: true,
      });

      expect(pref.channel).toBe("email");
      expect(pref.category).toBe("booking");
      expect(pref.frequency).toBe("instant");
      expect(pref.enabled).toBe(true);
      expect(pref.id).toBeDefined();
      expect(pref.createdAt).toBeInstanceOf(Date);
    });

    it("should update an existing preference without creating a duplicate", async () => {
      await service.updatePreference("user-1", {
        channel: "email",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });

      await service.updatePreference("user-1", {
        channel: "email",
        category: "booking",
        frequency: "daily",
        enabled: true,
      });

      const prefs = await service.getPreferences("user-1", "email", "booking");
      expect(prefs.length).toBe(1);
      expect(prefs[0].frequency).toBe("daily");
    });

    it("should filter preferences by channel", async () => {
      await service.updatePreference("user-1", {
        channel: "email",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });
      await service.updatePreference("user-1", {
        channel: "sms",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });

      const emailPrefs = await service.getPreferences("user-1", "email");
      expect(emailPrefs.length).toBe(1);
      expect(emailPrefs[0].channel).toBe("email");
    });

    it("should filter preferences by category", async () => {
      await service.updatePreference("user-1", {
        channel: "email",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });
      await service.updatePreference("user-1", {
        channel: "email",
        category: "marketing",
        frequency: "weekly",
        enabled: false,
      });

      const bookingPrefs = await service.getPreferences(
        "user-1",
        undefined,
        "booking",
      );
      expect(bookingPrefs.length).toBe(1);
      expect(bookingPrefs[0].category).toBe("booking");
    });

    it("should return all preferences when no filter is given", async () => {
      const channels: NotificationChannel[] = ["email", "sms", "push", "inapp"];
      for (const channel of channels) {
        await service.updatePreference("user-1", {
          channel,
          category: "booking",
          frequency: "instant",
          enabled: true,
        });
      }

      const all = await service.getPreferences("user-1");
      expect(all.length).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // Delivery gating
  // -------------------------------------------------------------------------

  describe("Delivery gating", () => {
    it("should default to enabled when no preference is set", async () => {
      const result = await service.shouldDeliver("user-new", "email", "booking");
      expect(result).toBe(true);
    });

    it("should return true for an explicitly enabled preference", async () => {
      await service.updatePreference("user-1", {
        channel: "email",
        category: "booking",
        frequency: "instant",
        enabled: true,
      });
      expect(await service.shouldDeliver("user-1", "email", "booking")).toBe(true);
    });

    it("should return false for a disabled preference", async () => {
      await service.updatePreference("user-1", {
        channel: "email",
        category: "marketing",
        frequency: "never",
        enabled: false,
      });
      expect(await service.shouldDeliver("user-1", "email", "marketing")).toBe(false);
    });

    it("should return false when frequency is 'never' even if enabled is true", async () => {
      await service.updatePreference("user-1", {
        channel: "push",
        category: "marketing",
        frequency: "never",
        enabled: true,
      });
      expect(await service.shouldDeliver("user-1", "push", "marketing")).toBe(false);
    });

    it("should bypass DND for system category", async () => {
      await service.updateUserSettings("user-dnd", {
        doNotDisturb: {
          enabled: true,
          startTime: "00:00",
          endTime: "23:59",
          timezone: "UTC",
        },
      });
      // system always bypasses DND
      expect(await service.shouldDeliver("user-dnd", "inapp", "system")).toBe(true);
    });

    it("should block non-system channels when DND covers the full day", async () => {
      // Set DND to cover the entire day so it is definitely active right now
      await service.updateUserSettings("user-dnd", {
        doNotDisturb: {
          enabled: true,
          startTime: "00:00",
          endTime: "23:59",
          timezone: "UTC",
        },
      });
      expect(await service.shouldDeliver("user-dnd", "email", "booking")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Notification queuing
  // -------------------------------------------------------------------------

  describe("Notification Queuing", () => {
    it("should queue a notification and return it with pending deliveries", async () => {
      const notif = await service.queueNotification(
        "user-1",
        {
          id: "notif-1",
          userId: "user-1",
          category: "booking" as NotificationCategory,
          title: "Flight Booked",
          body: "Your flight has been confirmed",
          timestamp: new Date(),
        },
        ["email", "push"],
      );

      expect(notif.id).toBe("notif-1");
      expect(notif.read).toBe(false);
      expect(notif.deliveries.length).toBeGreaterThan(0);
    });

    it("should exclude a channel disabled by preference", async () => {
      await service.updatePreference("user-1", {
        channel: "email",
        category: "booking",
        frequency: "never",
        enabled: false,
      });

      const notif = await service.queueNotification(
        "user-1",
        {
          id: "notif-2",
          userId: "user-1",
          category: "booking",
          title: "Test",
          body: "Body",
          timestamp: new Date(),
        },
        ["email", "push"],
      );

      expect(notif.deliveries.find((d) => d.channel === "email")).toBeUndefined();
    });

    it("should include all channels when all preferences are enabled", async () => {
      const channels: NotificationChannel[] = ["email", "sms", "push", "inapp"];
      for (const ch of channels) {
        await service.updatePreference("user-1", {
          channel: ch,
          category: "payment",
          frequency: "instant",
          enabled: true,
        });
      }

      const notif = await service.queueNotification(
        "user-1",
        {
          id: "notif-all",
          userId: "user-1",
          category: "payment",
          title: "Payment received",
          body: "Your payment was processed",
          timestamp: new Date(),
        },
        channels,
      );

      expect(notif.deliveries.length).toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // In-app inbox
  // -------------------------------------------------------------------------

  describe("In-App Notifications", () => {
    it("should retrieve in-app notifications newest-first", async () => {
      await service.queueNotification("user-1", {
        id: "old",
        userId: "user-1",
        category: "booking",
        title: "Old",
        body: "Body",
        timestamp: new Date(),
      }, ["inapp"]);

      await service.queueNotification("user-1", {
        id: "new",
        userId: "user-1",
        category: "booking",
        title: "New",
        body: "Body",
        timestamp: new Date(),
      }, ["inapp"]);

      const notifs = await service.getInAppNotifications("user-1");
      expect(notifs[0].id).toBe("new");
    });

    it("should mark a single notification as read", async () => {
      await service.queueNotification("user-1", {
        id: "notif-r",
        userId: "user-1",
        category: "booking",
        title: "Test",
        body: "Body",
        timestamp: new Date(),
      }, ["inapp"]);

      await service.markAsRead("user-1", "notif-r");
      const notifs = await service.getInAppNotifications("user-1");
      const target = notifs.find((n) => n.id === "notif-r");

      expect(target?.read).toBe(true);
      expect(target?.readAt).toBeInstanceOf(Date);
    });

    it("should mark all notifications as read and return the count", async () => {
      for (const id of ["n1", "n2", "n3"]) {
        await service.queueNotification("user-1", {
          id,
          userId: "user-1",
          category: "booking",
          title: id,
          body: "Body",
          timestamp: new Date(),
        }, ["inapp"]);
      }

      const count = await service.markAllAsRead("user-1");
      expect(count).toBe(3);

      const notifs = await service.getInAppNotifications("user-1");
      expect(notifs.every((n) => n.read)).toBe(true);
    });

    it("should clear all notifications and return the cleared count", async () => {
      for (const id of ["c1", "c2"]) {
        await service.queueNotification("user-1", {
          id,
          userId: "user-1",
          category: "payment",
          title: id,
          body: "Body",
          timestamp: new Date(),
        }, ["inapp"]);
      }

      const count = await service.clearNotifications("user-1");
      const remaining = await service.getInAppNotifications("user-1");

      expect(count).toBe(2);
      expect(remaining.length).toBe(0);
    });

    it("should respect the limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await service.queueNotification("user-lim", {
          id: `n${i}`,
          userId: "user-lim",
          category: "system",
          title: `Notif ${i}`,
          body: "Body",
          timestamp: new Date(),
        }, ["inapp"]);
      }

      const notifs = await service.getInAppNotifications("user-lim", 5);
      expect(notifs.length).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Flight status alert
  // -------------------------------------------------------------------------

  describe("sendFlightStatusAlert", () => {
    it("should return true and queue a notification for a delay", async () => {
      const result = await service.sendFlightStatusAlert(
        "user-1",
        "TQ101",
        "delayed",
        { delayMinutes: 45 },
      );

      expect(result).toBe(true);
      const notifs = await service.getInAppNotifications("user-1");
      expect(notifs.length).toBeGreaterThan(0);
      expect(notifs[0].title).toContain("TQ101");
    });

    it("should return true and queue a notification for a cancellation", async () => {
      const result = await service.sendFlightStatusAlert(
        "user-2",
        "TQ202",
        "cancelled",
        { reason: "Severe weather" },
      );

      expect(result).toBe(true);
      const notifs = await service.getInAppNotifications("user-2");
      expect(notifs[0].body).toContain("refund");
    });

    it("should return true and queue a gate change notification", async () => {
      const result = await service.sendFlightStatusAlert(
        "user-3",
        "TQ303",
        "gate_changed",
        { gate: "B12" },
      );

      expect(result).toBe(true);
      const notifs = await service.getInAppNotifications("user-3");
      expect(notifs[0].title).toContain("Gate");
    });

    it("should return true for a generic status update", async () => {
      const result = await service.sendFlightStatusAlert(
        "user-4",
        "TQ404",
        "boarding",
        {},
      );
      expect(result).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Delivery logging
  // -------------------------------------------------------------------------

  describe("Delivery Logging", () => {
    it("should log a delivery attempt and retrieve it", async () => {
      await service.logDelivery("notif-log", "user-1", "email", "sent");
      const logs = await service.getDeliveryLogs("user-1");

      expect(logs.length).toBe(1);
      expect(logs[0].channel).toBe("email");
      expect(logs[0].status).toBe("sent");
      expect(logs[0].timestamp).toBeInstanceOf(Date);
    });

    it("should respect the limit parameter on delivery logs", async () => {
      for (let i = 0; i < 20; i++) {
        await service.logDelivery(`n${i}`, "user-log", "push", "sent");
      }
      const logs = await service.getDeliveryLogs("user-log", 5);
      expect(logs.length).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe("Statistics", () => {
    it("should calculate total / read / unread correctly", async () => {
      for (const id of ["s1", "s2", "s3"]) {
        await service.queueNotification("user-stat", {
          id,
          userId: "user-stat",
          category: id === "s1" ? "booking" : "payment",
          title: id,
          body: "Body",
          timestamp: new Date(),
        }, ["inapp"]);
      }

      await service.markAsRead("user-stat", "s1");

      const stats = await service.getStatistics("user-stat");
      expect(stats.total).toBe(3);
      expect(stats.read).toBe(1);
      expect(stats.unread).toBe(2);
      expect(stats.byCategory["booking"]).toBe(1);
      expect(stats.byCategory["payment"]).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // User settings
  // -------------------------------------------------------------------------

  describe("User Settings", () => {
    it("should create default settings for a new user", async () => {
      const settings = await service.getUserSettings("user-new");
      expect(settings.userId).toBe("user-new");
      expect(settings.createdAt).toBeInstanceOf(Date);
    });

    it("should update email address", async () => {
      await service.updateUserSettings("user-1", {
        emailAddress: "alice@example.com",
      });
      const settings = await service.getUserSettings("user-1");
      expect(settings.emailAddress).toBe("alice@example.com");
    });

    it("should update phone number", async () => {
      await service.updateUserSettings("user-1", { phoneNumber: "+15551234567" });
      const settings = await service.getUserSettings("user-1");
      expect(settings.phoneNumber).toBe("+15551234567");
    });

    it("should update DND settings", async () => {
      await service.updateUserSettings("user-1", {
        doNotDisturb: {
          enabled: true,
          startTime: "22:00",
          endTime: "08:00",
          timezone: "America/New_York",
        },
      });
      const settings = await service.getUserSettings("user-1");
      expect(settings.doNotDisturb?.enabled).toBe(true);
      expect(settings.doNotDisturb?.startTime).toBe("22:00");
    });
  });

  // -------------------------------------------------------------------------
  // Retry logic
  // -------------------------------------------------------------------------

  describe("Retry logic", () => {
    it("getFailedDeliveries should return deliveries with status=failed and retryCount < 3", async () => {
      const notif = await service.queueNotification("user-retry", {
        id: "retry-notif",
        userId: "user-retry",
        category: "booking",
        title: "Retry test",
        body: "Body",
        timestamp: new Date(),
      }, ["email"]);

      // Manually mark as failed
      await service.updateDeliveryStatus("user-retry", notif.id, "email", "failed");

      const failed = await service.getFailedDeliveries();
      expect(failed.some((f) => f.notificationId === notif.id)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Type coverage (compile-time guards)
  // -------------------------------------------------------------------------

  describe("Channel and category type coverage", () => {
    it("should accept every valid channel", () => {
      const channels: NotificationChannel[] = ["email", "sms", "push", "inapp"];
      channels.forEach((c) =>
        expect(["email", "sms", "push", "inapp"]).toContain(c),
      );
    });

    it("should accept every valid category", () => {
      const categories: NotificationCategory[] = [
        "booking", "payment", "itinerary", "collaboration", "marketing", "system",
      ];
      categories.forEach((c) =>
        expect([
          "booking", "payment", "itinerary", "collaboration", "marketing", "system",
        ]).toContain(c),
      );
    });

    it("should accept every valid frequency", () => {
      const frequencies: NotificationFrequency[] = [
        "instant", "daily", "weekly", "never",
      ];
      frequencies.forEach((f) =>
        expect(["instant", "daily", "weekly", "never"]).toContain(f),
      );
    });
  });
});
