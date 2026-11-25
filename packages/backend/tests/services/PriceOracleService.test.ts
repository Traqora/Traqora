import axios from "axios";
import { PriceOracleService } from "../../src/services/PriceOracleService";

jest.mock("../../src/services/cache", () => ({
  invalidateAllFlightSearchCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../src/utils/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe("PriceOracleService refresh and confidence", () => {
  let oracle: PriceOracleService;

  beforeEach(() => {
    jest.restoreAllMocks();
    oracle = PriceOracleService.getInstance();
    oracle.invalidateRateCache();
  });

  it("coalesces concurrent refreshes into one provider request", async () => {
    const get = jest.spyOn(axios, "get").mockResolvedValue({
      data: { data: [{ id: "stellar", rateUsd: "0.12" }] },
    } as any);

    await Promise.all([
      oracle.fetchExchangeRates(),
      oracle.fetchExchangeRates(),
      oracle.fetchExchangeRates(),
    ]);

    expect(get).toHaveBeenCalledTimes(1);
    expect(oracle.getRate("XLM")).toBeCloseTo(0.12);
    expect(oracle.getConfidenceScore()).toBeGreaterThan(0.99);
  });

  it("ignores invalid provider rates and retains usable cached rates", async () => {
    jest.spyOn(axios, "get").mockResolvedValue({
      data: { data: [{ id: "stellar", rateUsd: "not-a-number" }] },
    } as any);

    await oracle.fetchExchangeRates();

    expect(oracle.getRate("XLM")).toBe(24.5);
    expect(oracle.getConfidenceScore()).toBe(0.25);
  });

  it("bounds confidence to zero as the last successful refresh ages", async () => {
    jest.spyOn(axios, "get").mockResolvedValue({
      data: { data: [{ id: "usd", rateUsd: "1" }] },
    } as any);
    await oracle.fetchExchangeRates();

    expect(
      oracle.getConfidenceScore(Date.now() + oracle.getRateCacheTtlMs() * 4),
    ).toBe(0);
  });
});
