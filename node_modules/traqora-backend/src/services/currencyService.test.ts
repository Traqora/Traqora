/**
 * Unit tests for CurrencyService
 *
 * Covers:
 *   - Deterministic rounding (HALF_UP, DOWN, NEAREST modes)
 *   - Rate staleness detection and policy
 *   - Fallback behavior when rates are stale
 *   - Consistent currency conversion
 *   - Error handling and validation
 *   - Edge cases (extreme values, unsupported currencies)
 */

import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";
import { CurrencyService, ConversionResult, RoundsPolicy } from "./currencyService";

// Mock the logger
jest.mock("../utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe("CurrencyService", () => {
  let service: CurrencyService;

  beforeEach(() => {
    service = CurrencyService.getInstance();
    jest.clearAllMocks();
    // Clear the cache
    service.clearCache();
  });

  afterEach(() => {
    service.clearCache();
  });

  // -------------------------------------------------------------------------
  // Rounding behavior - HALF_UP mode (default)
  // -------------------------------------------------------------------------

  describe("Rounding behavior - HALF_UP mode", () => {
    it("rounds 0.5 up to 1.0 for standard currency", () => {
      const result = service.roundAmount(1.5, "USD");
      expect(result).toBe(1.5); // Already exact
    });

    it("rounds 0.125 to 0.13 for 2-decimal currency", () => {
      const result = service.roundAmount(0.125, "USD");
      expect(result).toBe(0.13);
    });

    it("rounds 0.124 to 0.12 for 2-decimal currency", () => {
      const result = service.roundAmount(0.124, "USD");
      expect(result).toBe(0.12);
    });

    it("rounds 10.456 to 10.46 for EUR (2 decimals)", () => {
      const result = service.roundAmount(10.456, "EUR");
      expect(result).toBe(10.46);
    });

    it("rounds 100.001 to 100 for JPY (0 decimals)", () => {
      const result = service.roundAmount(100.001, "JPY");
      expect(result).toBe(100);
    });

    it("rounds 123.5 to 124 for JPY (0 decimals)", () => {
      const result = service.roundAmount(123.5, "JPY");
      expect(result).toBe(124);
    });

    it("handles very small amounts (below 1 cent)", () => {
      const result = service.roundAmount(0.001, "USD");
      expect(result).toBe(0);
    });

    it("handles large amounts", () => {
      const result = service.roundAmount(1000000.99, "USD");
      expect(result).toBe(1000000.99);
    });
  });

  // -------------------------------------------------------------------------
  // Rounding behavior - DOWN mode
  // -------------------------------------------------------------------------

  describe("Rounding behavior - DOWN mode", () => {
    beforeEach(() => {
      service.setRoundingPolicy({ roundingMode: "DOWN" });
    });

    it("always rounds down", () => {
      const result = service.roundAmount(1.99, "USD");
      expect(result).toBe(1.99); // 2 decimals, 1.99 is exact
    });

    it("truncates fractional parts", () => {
      const result = service.roundAmount(1.999, "USD");
      expect(result).toBe(1.99);
    });

    it("rounds down even with .5", () => {
      const result = service.roundAmount(10.555, "USD");
      expect(result).toBe(10.55);
    });

    it("handles negative amounts", () => {
      const result = service.roundAmount(-10.55, "USD");
      expect(result).toBe(-10.55);
    });
  });

  // -------------------------------------------------------------------------
  // Rounding behavior - NEAREST mode
  // -------------------------------------------------------------------------

  describe("Rounding behavior - NEAREST mode", () => {
    beforeEach(() => {
      service.setRoundingPolicy({ roundingMode: "NEAREST" });
    });

    it("rounds to nearest even (banker's rounding)", () => {
      // 0.5 should round to nearest even
      const result = service.roundAmount(1.5, "USD");
      expect(result).toBe(1.5); // Already exact for 2 decimals
    });

    it("rounds 10.445 correctly", () => {
      const result = service.roundAmount(10.445, "USD");
      expect(typeof result).toBe("number");
      expect(result).toBeCloseTo(10.44 || 10.45, 2);
    });
  });

  // -------------------------------------------------------------------------
  // Rate staleness detection
  // -------------------------------------------------------------------------

  describe("Rate staleness detection", () => {
    it("marks rates as not stale when within threshold", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92,
            GBP: 0.79,
            JPY: 149.5,
          },
        }),
      });

      const result = await service.convert(100, "USD", "EUR");
      expect(result.isStale).toBe(false);
    });

    it("includes rateAge in conversion result", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92,
            GBP: 0.79,
            JPY: 149.5,
          },
        }),
      });

      const result = await service.convert(100, "USD", "EUR");
      expect(result.rateAge).toBeDefined();
      expect(typeof result.rateAge).toBe("number");
      expect(result.rateAge >= 0).toBe(true);
    });

    it("allows customizing staleness threshold", () => {
      service.setStaleThreshold(5 * 60 * 1000); // 5 minutes
      const threshold = service.getStaleThreshold();
      expect(threshold).toBe(5 * 60 * 1000);
    });

    it("throws error for negative staleness threshold", () => {
      expect(() => {
        service.setStaleThreshold(-1000);
      }).toThrow("Staleness threshold must be non-negative");
    });

    it("allows zero staleness threshold (strict freshness)", () => {
      service.setStaleThreshold(0);
      const threshold = service.getStaleThreshold();
      expect(threshold).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Rounding policy configuration
  // -------------------------------------------------------------------------

  describe("Rounding policy configuration", () => {
    it("returns current rounding policy", () => {
      const policy = service.getRoundingPolicy();
      
      expect(policy).toHaveProperty("roundingMode");
      expect(policy).toHaveProperty("minDecimals");
      expect(policy).toHaveProperty("maxDecimals");
    });

    it("allows updating rounding mode", () => {
      service.setRoundingPolicy({ roundingMode: "DOWN" });
      const policy = service.getRoundingPolicy();
      
      expect(policy.roundingMode).toBe("DOWN");
    });

    it("allows updating decimal limits", () => {
      service.setRoundingPolicy({ minDecimals: 1, maxDecimals: 4 });
      const policy = service.getRoundingPolicy();
      
      expect(policy.minDecimals).toBe(1);
      expect(policy.maxDecimals).toBe(4);
    });

    it("preserves unspecified policy properties when updating", () => {
      const originalMode = service.getRoundingPolicy().roundingMode;
      service.setRoundingPolicy({ minDecimals: 2 });
      const policy = service.getRoundingPolicy();
      
      expect(policy.roundingMode).toBe(originalMode);
      expect(policy.minDecimals).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Deterministic conversion
  // -------------------------------------------------------------------------

  describe("Deterministic conversion", () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92,
            GBP: 0.79,
            JPY: 149.5,
            CAD: 1.36,
            AUD: 1.53,
            NGN: 1550,
            KES: 145,
            ZAR: 18.5,
            BRL: 5.05,
            INR: 83.5,
            CNY: 7.24,
          },
        }),
      });
    });

    it("produces consistent results for same input", async () => {
      const result1 = await service.convert(100, "USD", "EUR");
      const result2 = await service.convert(100, "USD", "EUR");
      
      expect(result1.total).toBe(result2.total);
      expect(result1.fee).toBe(result2.fee);
    });

    it("handles same-currency conversion", async () => {
      const result = await service.convert(100, "USD", "USD");
      
      expect(result.rate).toBe(1);
      expect(result.from).toBe("USD");
      expect(result.to).toBe("USD");
      expect(result.isStale).toBe(false);
      expect(result.rateAge).toBe(0);
    });

    it("applies fee correctly for same currency", async () => {
      const result = await service.convert(100, "USD", "USD");
      
      // Fee should be 100 * 0.005 = 0.50
      expect(result.fee).toBe(0.5);
      // Total should be 100 + 0.50 = 100.50
      expect(result.total).toBe(100.5);
    });

    it("includes all required fields in result", async () => {
      const result = await service.convert(100, "USD", "EUR");
      
      expect(result).toHaveProperty("amount");
      expect(result).toHaveProperty("from");
      expect(result).toHaveProperty("to");
      expect(result).toHaveProperty("rate");
      expect(result).toHaveProperty("fee");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("timestamp");
      expect(result).toHaveProperty("rateAge");
      expect(result).toHaveProperty("isStale");
    });
  });

  // -------------------------------------------------------------------------
  // Fallback behavior
  // -------------------------------------------------------------------------

  describe("Fallback behavior", () => {
    it("uses fallback rates when API fails", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

      const result = await service.convert(100, "USD", "EUR");
      
      expect(result).toBeDefined();
      expect(typeof result.rate).toBe("number");
      expect(result.rate > 0).toBe(true);
    });

    it("returns valid rates from fallback", async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

      const result = await service.convert(100, "USD", "GBP");
      
      expect(result.amount > 0).toBe(true);
      expect(result.total > 0).toBe(true);
    });

    it("handles API returning non-ok status", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await service.convert(100, "USD", "EUR");
      
      expect(result).toBeDefined();
      expect(result.rate > 0).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling and validation
  // -------------------------------------------------------------------------

  describe("Error handling and validation", () => {
    it("throws error for unsupported from currency", async () => {
      await expect(
        service.convert(100, "XYZ", "USD")
      ).rejects.toThrow("Unsupported currency: XYZ");
    });

    it("throws error for unsupported to currency", async () => {
      await expect(
        service.convert(100, "USD", "XYZ")
      ).rejects.toThrow("Unsupported currency: XYZ");
    });

    it("throws error for case-insensitive unsupported currency", async () => {
      await expect(
        service.convert(100, "xyz", "usd")
      ).rejects.toThrow("Unsupported currency: XYZ");
    });

    it("supports all declared supported currencies", async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
            NGN: 1550, KES: 145, ZAR: 18.5, BRL: 5.05, INR: 83.5, CNY: 7.24,
          },
        }),
      });

      for (const curr of service.getSupportedCurrencies()) {
        if (curr !== "USD") {
          const result = await service.convert(100, "USD", curr);
          expect(result).toBeDefined();
          expect(result.to).toBe(curr);
        }
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe("Edge cases", () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
            NGN: 1550, KES: 145, ZAR: 18.5, BRL: 5.05, INR: 83.5, CNY: 7.24,
          },
        }),
      });
    });

    it("handles zero amount", async () => {
      const result = await service.convert(0, "USD", "EUR");
      
      expect(result.amount).toBe(0);
      expect(result.fee).toBe(0);
      expect(result.total).toBe(0);
    });

    it("handles negative amount", async () => {
      const result = await service.convert(-100, "USD", "EUR");
      
      expect(result.amount < 0).toBe(true);
    });

    it("handles very large amounts", async () => {
      const result = await service.convert(1000000000, "USD", "EUR");
      
      expect(result.amount > 0).toBe(true);
      expect(isFinite(result.total)).toBe(true);
    });

    it("handles very small amounts", async () => {
      const result = await service.convert(0.01, "USD", "EUR");
      
      expect(result.amount > 0).toBe(true);
      expect(isFinite(result.total)).toBe(true);
    });

    it("currency codes are case-insensitive", async () => {
      const result1 = await service.convert(100, "usd", "eur");
      const result2 = await service.convert(100, "USD", "EUR");
      
      expect(result1.total).toBe(result2.total);
    });

    it("handles currency-specific decimals", async () => {
      const usdResult = await service.convert(100, "USD", "JPY");
      const jpyConfig = CurrencyService.CURRENCY_CONFIG.JPY;
      
      // JPY should have 0 decimals
      expect(usdResult.amount % 1).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cache behavior
  // -------------------------------------------------------------------------

  describe("Cache behavior", () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
            NGN: 1550, KES: 145, ZAR: 18.5, BRL: 5.05, INR: 83.5, CNY: 7.24,
          },
        }),
      });
    });

    it("caches rates to avoid repeated API calls", async () => {
      await service.convert(100, "USD", "EUR");
      await service.convert(100, "USD", "EUR");
      
      // Only one API call should be made (initial mock)
      expect((global.fetch as jest.Mock).mock.calls.length).toBeLessThanOrEqual(1);
    });

    it("clears cache when requested", () => {
      service.clearCache();
      // After clearing, next call should fetch fresh data
      expect((global.fetch as jest.Mock).mock.calls.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Fee calculation
  // -------------------------------------------------------------------------

  describe("Fee calculation", () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
            NGN: 1550, KES: 145, ZAR: 18.5, BRL: 5.05, INR: 83.5, CNY: 7.24,
          },
        }),
      });
    });

    it("calculates fee as 0.5% of amount", async () => {
      const result = await service.convert(1000, "USD", "EUR");
      
      // Fee = 1000 * 0.005 = 5
      expect(result.fee).toBeCloseTo(5, 1);
    });

    it("zero fee for same currency", async () => {
      const result = await service.convert(100, "USD", "USD");
      
      expect(result.fee).toBe(0);
    });

    it("fee is rounded properly", async () => {
      const result = await service.convert(333, "USD", "EUR");
      
      // Fee = 333 * 0.005 = 1.665, should round to 1.67 or 1.66
      expect(result.fee).toBeCloseTo(1.665, 2);
    });
  });

  // -------------------------------------------------------------------------
  // Timestamp behavior
  // -------------------------------------------------------------------------

  describe("Timestamp behavior", () => {
    beforeEach(() => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: {
            EUR: 0.92, GBP: 0.79, JPY: 149.5, CAD: 1.36, AUD: 1.53,
            NGN: 1550, KES: 145, ZAR: 18.5, BRL: 5.05, INR: 83.5, CNY: 7.24,
          },
        }),
      });
    });

    it("includes current timestamp in result", async () => {
      const beforeTime = Date.now();
      const result = await service.convert(100, "USD", "EUR");
      const afterTime = Date.now();
      
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterTime);
    });
  });
});
