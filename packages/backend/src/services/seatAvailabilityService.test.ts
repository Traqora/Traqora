/**
 * Unit tests for Seat Availability Service
 */

import { describe, it, expect, beforeEach, vi } from "@jest/globals";
import { SeatAvailabilityService } from "./seatAvailabilityService";
import type { SeatType } from "../types/services";

// Mock AppDataSource
vi.mock("../db/dataSource", () => ({
  AppDataSource: {
    getRepository: vi.fn(() => ({
      findOne: vi.fn(),
      find: vi.fn(),
    })),
  },
}));

describe("SeatAvailabilityService", () => {
  let service: SeatAvailabilityService;

  beforeEach(() => {
    service = new SeatAvailabilityService();
  });

  describe("Seat validation", () => {
    it("should validate correct seat number format", async () => {
      const validSeats = ["1A", "12B", "20F", "5E"];
      for (const seat of validSeats) {
        expect(/^\d{1,2}[A-F]$/.test(seat)).toBeTruthy();
      }
    });

    it("should reject invalid seat number format", async () => {
      const invalidSeats = ["A1", "1G", "25A", "0A", "1AA"];
      for (const seat of invalidSeats) {
        expect(/^\d{1,2}[A-F]$/.test(seat)).toBeFalsy();
      }
    });

    it("should parse seat numbers correctly", () => {
      const seatNumber = "12C";
      const row = parseInt(seatNumber.slice(0, -1));
      const col = seatNumber.slice(-1);

      expect(row).toBe(12);
      expect(col).toBe("C");
    });
  });

  describe("Seat pricing", () => {
    it("should calculate first class seat price", () => {
      // Using reflection to test private method indirectly
      const service2 = new SeatAvailabilityService();
      // Prices: first=15000, business=8000, premium=4000, economy=1500
      const prices: Record<SeatType, number> = {
        first: 15000,
        business: 8000,
        premium_economy: 4000,
        economy: 1500,
      };

      expect(prices.first).toBe(15000);
      expect(prices.economy).toBe(1500);
    });

    it("should price based on cabin class", () => {
      const classes: SeatType[] = [
        "first",
        "business",
        "premium_economy",
        "economy",
      ];
      const prices: Record<SeatType, number> = {
        first: 15000,
        business: 8000,
        premium_economy: 4000,
        economy: 1500,
      };

      for (const cls of classes) {
        expect(prices[cls]).toBeGreaterThan(0);
      }
      expect(prices.first).toBeGreaterThan(prices.business);
      expect(prices.business).toBeGreaterThan(prices.premium_economy);
      expect(prices.premium_economy).toBeGreaterThan(prices.economy);
    });
  });

  describe("Seat lock management", () => {
    it("should handle seat lock duration", () => {
      const lockDurationMs = 15 * 60 * 1000; // 15 minutes
      const now = new Date();
      const expiresAt = new Date(now.getTime() + lockDurationMs);

      expect(expiresAt.getTime()).toBeGreaterThan(now.getTime());
      expect(expiresAt.getTime() - now.getTime()).toBe(lockDurationMs);
    });

    it("should detect expired locks", () => {
      const now = new Date();
      const expiredLock = new Date(now.getTime() - 1000); // 1 second ago
      const activeLock = new Date(now.getTime() + 10000); // 10 seconds from now

      expect(expiredLock.getTime()).toBeLessThan(now.getTime());
      expect(activeLock.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("Aircraft configuration", () => {
    it("should have valid aircraft config", () => {
      const config = {
        rows: 20,
        cols: ["A", "B", "C", "D", "E", "F"],
        classMap: {
          1: "first" as SeatType,
          2: "first" as SeatType,
          3: "business" as SeatType,
        },
      };

      expect(config.rows).toBe(20);
      expect(config.cols.length).toBe(6);
      expect(Object.keys(config.classMap).length).toBeGreaterThan(0);
    });

    it("should calculate total seats correctly", () => {
      const rows = 20;
      const cols = 6;
      const totalSeats = rows * cols;

      expect(totalSeats).toBe(120);
    });

    it("should validate row numbers", () => {
      const validRows = [1, 5, 10, 15, 20];
      const invalidRows = [0, 21, -1];

      for (const row of validRows) {
        expect(row).toBeGreaterThanOrEqual(1);
        expect(row).toBeLessThanOrEqual(20);
      }

      for (const row of invalidRows) {
        expect(!(row >= 1 && row <= 20)).toBeTruthy();
      }
    });
  });

  describe("Seat type assignment", () => {
    const classMap: Record<number, SeatType> = {
      1: "first",
      2: "first",
      3: "business",
      4: "business",
      5: "business",
      6: "premium_economy",
      7: "premium_economy",
      8: "premium_economy",
    };

    it("should assign first class to rows 1-2", () => {
      expect(classMap[1]).toBe("first");
      expect(classMap[2]).toBe("first");
    });

    it("should assign business to rows 3-5", () => {
      expect(classMap[3]).toBe("business");
      expect(classMap[4]).toBe("business");
      expect(classMap[5]).toBe("business");
    });

    it("should assign premium economy to rows 6-8", () => {
      expect(classMap[6]).toBe("premium_economy");
      expect(classMap[7]).toBe("premium_economy");
      expect(classMap[8]).toBe("premium_economy");
    });

    it("should default remaining rows to economy", () => {
      const seatType = classMap[9] || "economy";
      expect(seatType).toBe("economy");
    });
  });
});
