import { describe, it, expect, beforeEach, jest } from "@jest/globals";

import { SeatAvailabilityService } from "./seatAvailabilityService";
import { detectReferralFraud } from "./referralFraudHeuristics";
import { PriceOracleService } from "./PriceOracleService";
import {
  analyticsAlertEventSchema,
  distributionAnalyticsEventSchema,
  revenueAnalyticsEventSchema,
} from "./analyticsEventSchema";

jest.mock("../db/dataSource", () => ({
  AppDataSource: {
    isInitialized: true,
    getRepository: jest.fn(() => ({
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      save: jest.fn(),
      create: jest.fn((value) => value),
    })),
  },
}));

describe("backend issue regressions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("flags referral abuse signals without blocking the flow", () => {
    const signals = detectReferralFraud({
      referrerId: "referrer-1",
      refereeId: "referrer-1",
      refereeIp: "203.0.113.10",
      recentIpEventCount: 3,
      priorConversionCount: 1,
    });

    expect(signals).toEqual([
      "self_referral",
      "one_time_use_anomaly",
      "ip_cluster",
    ]);
    expect(signals).not.toContain("block");
  });

  it("accepts ISO timestamps for metrics and drops malformed analytics events", () => {
    const distribution = distributionAnalyticsEventSchema.safeParse({
      distributionId: "dist-1",
      amount: 1250,
      currency: "USD",
      timestamp: "2024-01-02T03:04:05.000Z",
    });
    const revenue = revenueAnalyticsEventSchema.safeParse({
      bookingId: "booking-1",
      revenueCents: 3000,
      delta: 250,
      timestamp: "2024-01-02T03:04:05.000Z",
    });
    const alert = analyticsAlertEventSchema.safeParse({
      alertId: "alert-1",
      type: "anomaly",
      severity: "high",
      message: "unexpected spend spike",
      timestamp: "2024-01-02T03:04:05.000Z",
    });

    expect(distribution.success).toBe(true);
    expect(revenue.success).toBe(true);
    expect(alert.success).toBe(true);

    if (distribution.success) {
      expect(distribution.data.timestamp).toBeInstanceOf(Date);
    }

    expect(
      distributionAnalyticsEventSchema.safeParse({
        distributionId: "dist-2",
        amount: -10,
        currency: "USD",
        timestamp: "not-a-date",
      }).success,
    ).toBe(false);
  });

  it("publishes a bounded confidence score for fresh oracle prices and can refresh when stale", async () => {
    const oracle = PriceOracleService.getInstance();
    const prices = await oracle.fetchPrices(["flight-1"], "USD");

    expect(prices).toHaveLength(1);
    expect(prices[0].confidenceScore).toBeGreaterThanOrEqual(0);
    expect(prices[0].confidenceScore).toBeLessThanOrEqual(1);

    const serviceAny = oracle as any;
    serviceAny.lastSuccessfulRefreshAt = Date.now() - 10_000_000;
    expect(oracle.getConfidenceScore(Date.now())).toBeLessThan(1);
    expect(oracle.getConfidenceScore(Date.now())).toBeGreaterThanOrEqual(0);
  });

  it("never double-books a seat under concurrent locks", async () => {
    const service = new SeatAvailabilityService();
    service.clearAllLocksAndHolds();

    const lockAttempts = Array.from({ length: 20 }, (_, index) =>
      service.lockSeat("flight-1", "1A", `booking-${index}`),
    );

    const results = await Promise.allSettled(lockAttempts);
    const successful = results.filter(
      (result) => result.status === "fulfilled",
    ).length;

    expect(successful).toBe(1);
  });
});
