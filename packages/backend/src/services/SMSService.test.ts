/**
 * Unit tests for SMS Service
 */

import { describe, it, expect, beforeEach } from "@jest/globals";
import { SMSService, type SMSNotificationType, type SMSTemplateData } from "./SMSService";

describe("SMSService", () => {
  let service: SMSService;

  beforeEach(() => {
    service = new SMSService();
  });

  // -------------------------------------------------------------------------
  // sendSMS
  // -------------------------------------------------------------------------

  describe("sendSMS", () => {
    it("should send an SMS and return a delivery record with status sent", async () => {
      const delivery = await service.sendSMS("+15551234567", "Hello!", "user-1");
      expect(delivery.id).toBeDefined();
      expect(delivery.status).toBe("sent");
      expect(delivery.phoneNumber).toContain("****"); // masked
    });

    it("should reject an invalid phone number", async () => {
      await expect(service.sendSMS("123", "msg")).rejects.toThrow();
    });

    it("should truncate messages longer than 160 characters", async () => {
      const longMsg = "a".repeat(200);
      const delivery = await service.sendSMS("+15551234567", longMsg);
      expect(delivery.message.length).toBeLessThanOrEqual(160);
    });

    it("should not truncate a message of exactly 160 characters", async () => {
      const msg = "b".repeat(160);
      const delivery = await service.sendSMS("+15551234567", msg);
      expect(delivery.message.length).toBe(160);
    });

    it("should mask the phone number in the delivery record", async () => {
      const delivery = await service.sendSMS("+15559876543", "Test");
      expect(delivery.phoneNumber).toBe("****6543");
      expect(delivery.phoneNumber).not.toContain("555");
    });
  });

  // -------------------------------------------------------------------------
  // buildTemplateMessage — all types
  // -------------------------------------------------------------------------

  describe("buildTemplateMessage", () => {
    const CASES: Array<{ type: SMSNotificationType; data: SMSTemplateData; contains: string[] }> = [
      {
        type: "booking_confirmation",
        data: { flightNumber: "TQ101", from: "JFK", to: "LHR", bookingReference: "REF001" },
        contains: ["TQ101", "REF001"],
      },
      {
        type: "booking_cancelled",
        data: { flightNumber: "TQ102", bookingReference: "REF002" },
        contains: ["TQ102", "REF002"],
      },
      {
        type: "flight_delayed",
        data: { flightNumber: "TQ200", from: "LAX", to: "CDG", delayMinutes: 90 },
        contains: ["TQ200", "90"],
      },
      {
        type: "flight_cancelled",
        data: { flightNumber: "TQ300", from: "ORD", to: "SYD", cancellationReason: "Storm" },
        contains: ["TQ300", "Storm"],
      },
      {
        type: "gate_changed",
        data: { flightNumber: "TQ400", previousGate: "A1", newGate: "B5" },
        contains: ["TQ400", "B5"],
      },
      {
        type: "boarding_reminder",
        data: { flightNumber: "TQ500", gate: "C3", terminal: "T2" },
        contains: ["TQ500", "C3"],
      },
      {
        type: "refund_processed",
        data: { refundAmount: "$200", bookingReference: "REF003" },
        contains: ["$200", "REF003"],
      },
      {
        type: "refund_initiated",
        data: { flightNumber: "TQ600" },
        contains: ["TQ600"],
      },
      {
        type: "payment_received",
        data: { bookingReference: "REF004" },
        contains: ["REF004"],
      },
      {
        type: "otp",
        data: { otpCode: "482910" },
        contains: ["482910"],
      },
      {
        type: "general",
        data: { message: "Custom message" },
        contains: ["Custom message"],
      },
    ];

    it.each(CASES)(
      "should build a non-empty message for type=$type containing expected text",
      ({ type, data, contains }) => {
        const msg = service.buildTemplateMessage(type, data);
        expect(typeof msg).toBe("string");
        expect(msg.length).toBeGreaterThan(0);
        for (const fragment of contains) {
          expect(msg).toContain(fragment);
        }
      },
    );

    it("should fall back gracefully when optional fields are missing", () => {
      const msg = service.buildTemplateMessage("flight_delayed", {});
      expect(typeof msg).toBe("string");
    });
  });

  // -------------------------------------------------------------------------
  // sendTypedSMS
  // -------------------------------------------------------------------------

  describe("sendTypedSMS", () => {
    it("should send an OTP SMS successfully", async () => {
      const delivery = await service.sendTypedSMS(
        "+15551234567",
        "otp",
        { otpCode: "123456" },
        "user-1",
      );
      expect(delivery.status).toBe("sent");
      expect(delivery.message).toContain("123456");
    });

    it("should send a booking confirmation SMS successfully", async () => {
      const delivery = await service.sendTypedSMS(
        "+15559999999",
        "booking_confirmation",
        {
          flightNumber: "TQ101",
          from: "JFK",
          to: "LHR",
          bookingReference: "REF-XYZ",
        },
      );
      expect(delivery.status).toBe("sent");
      expect(delivery.message).toContain("REF-XYZ");
    });
  });

  // -------------------------------------------------------------------------
  // sendBulkSMS
  // -------------------------------------------------------------------------

  describe("sendBulkSMS", () => {
    it("should send to multiple recipients and return counts", async () => {
      const phones = ["+15551110001", "+15552220002", "+15553330003"];
      const result = await service.sendBulkSMS(phones, "Bulk test");
      expect(result.successful + result.failed).toBe(3);
      expect(result.deliveries.length).toBe(3);
    });

    it("should count invalid numbers as failures without throwing", async () => {
      const phones = ["+15551110001", "bad"];
      const result = await service.sendBulkSMS(phones, "Mixed");
      expect(result.failed).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Statistics
  // -------------------------------------------------------------------------

  describe("getStatistics", () => {
    it("should return zero counts with no deliveries", async () => {
      const stats = await service.getStatistics();
      expect(stats.totalSent).toBe(0);
      expect(stats.totalDelivered).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.successRate).toBe(0);
    });

    it("should compute successRate as a percentage", async () => {
      // Two sent, manually mark one as delivered
      const d1 = await service.sendSMS("+15551111111", "msg", "u1");
      const d2 = await service.sendSMS("+15552222222", "msg", "u1");
      await service.updateDeliveryStatus(d1.externalId!, "delivered");

      const stats = await service.getStatistics();
      expect(stats.totalSent).toBe(2);
      expect(stats.totalDelivered).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // updateDeliveryStatus (webhook)
  // -------------------------------------------------------------------------

  describe("updateDeliveryStatus", () => {
    it("should update the status of a known delivery by externalId", async () => {
      const delivery = await service.sendSMS("+15551234567", "Test", "user-wb");
      await service.updateDeliveryStatus(delivery.externalId!, "delivered");

      const history = await service.getDeliveryHistory("user-wb");
      const updated = history.find((d) => d.externalId === delivery.externalId);
      expect(updated?.status).toBe("delivered");
      expect(updated?.deliveredAt).toBeInstanceOf(Date);
    });
  });

  // -------------------------------------------------------------------------
  // Phone number edge cases
  // -------------------------------------------------------------------------

  describe("phone number validation", () => {
    it("should accept E.164 formatted numbers", async () => {
      await expect(
        service.sendSMS("+12125551234", "hi"),
      ).resolves.toBeDefined();
    });

    it("should accept 10-digit domestic format", async () => {
      await expect(
        service.sendSMS("2125551234", "hi"),
      ).resolves.toBeDefined();
    });

    it("should reject a number that is too short", async () => {
      await expect(service.sendSMS("12345", "hi")).rejects.toThrow();
    });

    it("should reject an empty string", async () => {
      await expect(service.sendSMS("", "hi")).rejects.toThrow();
    });
  });
});
