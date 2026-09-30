/**
 * Unit tests for Push Notification Service
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import {
  PushNotificationService,
  type PushNotificationType,
  type TypedPushData,
} from "./PushNotificationService";

describe("PushNotificationService", () => {
  let service: PushNotificationService;

  const makeSub = (suffix = "1") => ({
    endpoint: `https://fcm.googleapis.com/push/${suffix}`,
    auth: `base64auth${suffix}`,
    p256dh: `base64key${suffix}`,
    userAgent: `Mozilla/5.0 (test/${suffix})`,
  });

  beforeEach(() => {
    service = new PushNotificationService();
  });

  // -------------------------------------------------------------------------
  // Subscription management
  // -------------------------------------------------------------------------

  describe("Push Subscriptions", () => {
    it("should subscribe a user device and return a PushSubscription", async () => {
      const result = await service.subscribe("user-1", makeSub());

      expect(result.userId).toBe("user-1");
      expect(result.endpoint).toBe(makeSub().endpoint);
      expect(result.isActive).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("should return the existing subscription on duplicate endpoint", async () => {
      const first = await service.subscribe("user-1", makeSub());
      const second = await service.subscribe("user-1", makeSub());

      expect(second.id).toBe(first.id);
    });

    it("should reactivate a previously inactive subscription on re-subscribe", async () => {
      await service.subscribe("user-1", makeSub());
      await service.unsubscribe("user-1", makeSub().endpoint);

      // Re-subscribe with the same endpoint
      const reactivated = await service.subscribe("user-1", makeSub());
      expect(reactivated.isActive).toBe(true);

      const subs = await service.getSubscriptions("user-1");
      expect(subs.length).toBe(1);
    });

    it("should unsubscribe a device and hide it from getSubscriptions", async () => {
      await service.subscribe("user-1", makeSub());
      await service.unsubscribe("user-1", makeSub().endpoint);

      const subs = await service.getSubscriptions("user-1");
      expect(subs.length).toBe(0);
    });

    it("should return only active subscriptions", async () => {
      await service.subscribe("user-1", makeSub("a"));
      await service.subscribe("user-1", makeSub("b"));
      await service.unsubscribe("user-1", makeSub("a").endpoint);

      const subs = await service.getSubscriptions("user-1");
      expect(subs.length).toBe(1);
      expect(subs[0].endpoint).toContain("b");
    });

    it("should return an empty array for a user with no subscriptions", async () => {
      const subs = await service.getSubscriptions("user-unknown");
      expect(subs).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Push sending
  // -------------------------------------------------------------------------

  describe("sendPush", () => {
    it("should report 0/0 when user has no subscriptions", async () => {
      const result = await service.sendPush("user-none", "Title", { body: "Body" });
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("should return a result object with successful + failed summing to subscription count", async () => {
      await service.subscribe("user-1", makeSub());
      const result = await service.sendPush("user-1", "Test", { body: "Body" });
      expect(result.successful + result.failed).toBe(1);
    });

    it("should include all push options in the call without throwing", async () => {
      await service.subscribe("user-1", makeSub());
      const result = await service.sendPush("user-1", "Title", {
        body: "Body",
        icon: "/icon.png",
        badge: "/badge.png",
        tag: "booking",
        data: { bookingId: "ref-001" },
        requireInteraction: true,
        actions: [{ action: "view", title: "View Booking" }],
      });
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Typed push
  // -------------------------------------------------------------------------

  describe("sendTypedPush", () => {
    const TYPES: Array<{ type: PushNotificationType; data: TypedPushData }> = [
      {
        type: "booking",
        data: { flightNumber: "TQ101", bookingReference: "REF001" },
      },
      { type: "reminder", data: { flightNumber: "TQ101" } },
      {
        type: "refund",
        data: { refundAmount: "$150", bookingReference: "REF002" },
      },
      {
        type: "flight_delayed",
        data: {
          flightNumber: "TQ200",
          from: "JFK",
          to: "LHR",
          delayMinutes: 60,
        },
      },
      {
        type: "flight_delayed_significant",
        data: {
          flightNumber: "TQ201",
          from: "LAX",
          to: "CDG",
          delayMinutes: 180,
        },
      },
      {
        type: "flight_cancelled",
        data: {
          flightNumber: "TQ300",
          from: "DFW",
          to: "SYD",
          cancellationReason: "Weather",
        },
      },
      {
        type: "gate_changed",
        data: {
          flightNumber: "TQ400",
          previousGate: "A1",
          newGate: "B5",
        },
      },
      {
        type: "boarding_reminder",
        data: { flightNumber: "TQ500", gate: "C3", terminal: "T2" },
      },
      {
        type: "flight_status",
        data: {
          flightNumber: "TQ600",
          from: "ORD",
          to: "MIA",
          status: "on time",
        },
      },
      { type: "refund_initiated", data: { flightNumber: "TQ700" } },
      {
        type: "payment",
        data: { bookingReference: "REF003" },
      },
      { type: "marketing", data: {} },
      { type: "system", data: {} },
    ];

    it.each(TYPES)(
      "should send typed push for type=$type without throwing",
      async ({ type, data }) => {
        await service.subscribe("user-typed", makeSub());
        const result = await service.sendTypedPush("user-typed", type, data);
        expect(result).toBeDefined();
        expect(typeof result.successful).toBe("number");
        expect(typeof result.failed).toBe("number");
      },
    );

    it("should build correct title for booking type", async () => {
      // Access private method via cast so we can unit-test the template logic
      const svc = service as any;
      const msg = svc.buildTypedMessage("booking", {
        flightNumber: "TQ101",
        bookingReference: "REF001",
      });
      expect(msg.title).toBe("Booking Confirmed");
      expect(msg.body).toContain("TQ101");
      expect(msg.body).toContain("REF001");
    });

    it("should build correct title for flight_cancelled type", async () => {
      const svc = service as any;
      const msg = svc.buildTypedMessage("flight_cancelled", {
        flightNumber: "TQ300",
        from: "JFK",
        to: "LHR",
        cancellationReason: "Strike",
      });
      expect(msg.title).toContain("TQ300");
      expect(msg.body).toContain("Strike");
    });
  });

  // -------------------------------------------------------------------------
  // Broadcast
  // -------------------------------------------------------------------------

  describe("broadcastPush", () => {
    it("should broadcast to multiple users and sum results", async () => {
      const userIds = ["u1", "u2", "u3"];
      for (const uid of userIds) {
        await service.subscribe(uid, makeSub(uid));
      }

      const result = await service.broadcastPush(
        "Broadcast Title",
        { body: "Broadcast body" },
        userIds,
      );

      expect(result.totalSent + result.totalFailed).toBe(3);
    });

    it("should handle a user list with no subscriptions without throwing", async () => {
      const result = await service.broadcastPush(
        "Title",
        { body: "Body" },
        ["ghost-1", "ghost-2"],
      );
      expect(result.totalSent).toBe(0);
      expect(result.totalFailed).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Subscription statistics
  // -------------------------------------------------------------------------

  describe("getSubscriptionStats", () => {
    it("should report correct totals after subscribe/unsubscribe", async () => {
      await service.subscribe("u1", makeSub("1"));
      await service.subscribe("u2", makeSub("2"));
      await service.subscribe("u2", makeSub("3")); // second sub for u2
      await service.unsubscribe("u1", makeSub("1").endpoint);

      const stats = await service.getSubscriptionStats();

      expect(stats.totalUsers).toBe(2);
      expect(stats.totalSubscriptions).toBe(3);
      expect(stats.activeSubscriptions).toBe(2); // u1's was deactivated
    });

    it("should return zeros when no subscriptions exist", async () => {
      const stats = await service.getSubscriptionStats();
      expect(stats.totalUsers).toBe(0);
      expect(stats.totalSubscriptions).toBe(0);
      expect(stats.activeSubscriptions).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  describe("cleanupInactiveSubscriptions", () => {
    it("should remove subscriptions not used within maxAge", async () => {
      await service.subscribe("user-old", makeSub());
      const subs = (service as any).subscriptions as Map<string, any[]>;
      // Back-date lastUsedAt to 31 days ago
      const sub = subs.get("user-old")![0];
      sub.lastUsedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      const cleaned = await service.cleanupInactiveSubscriptions(
        30 * 24 * 60 * 60 * 1000,
      );
      expect(cleaned).toBe(1);

      const remaining = await service.getSubscriptions("user-old");
      expect(remaining.length).toBe(0);
    });

    it("should keep recently used subscriptions", async () => {
      await service.subscribe("user-recent", makeSub());
      const cleaned = await service.cleanupInactiveSubscriptions(
        30 * 24 * 60 * 60 * 1000,
      );
      expect(cleaned).toBe(0);
    });
  });
});
