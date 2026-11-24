import {
  DEFAULT_CONNECTION_TIME_CONFIG,
  hasInsufficientConnection,
  validateConnectionTimes,
  type ConnectionSegment,
} from "../connectionTimeValidation";

function segment(
  from: string,
  to: string,
  departureAt: string,
  arrivalAt: string,
  extra: Partial<ConnectionSegment> = {},
): ConnectionSegment {
  return { from, to, departureAt, arrivalAt, ...extra };
}

describe("validateConnectionTimes (#901)", () => {
  it("accepts a protected connection at the pair minimum", () => {
    const flags = validateConnectionTimes([
      segment("JFK", "LHR", "2026-11-15T10:00:00Z", "2026-11-15T18:00:00Z", {
        ticketId: "t1",
      }),
      segment("LHR", "CDG", "2026-11-15T20:00:00Z", "2026-11-15T21:10:00Z", {
        ticketId: "t1",
      }),
    ]);

    expect(flags).toHaveLength(1);
    expect(flags[0].ok).toBe(true);
    expect(flags[0].requiredMinutes).toBe(
      DEFAULT_CONNECTION_TIME_CONFIG.pairMinutes!["LHR-LHR"],
    );
    expect(flags[0].selfTransfer).toBe(false);
    expect(hasInsufficientConnection(flags)).toBe(false);
  });

  it("flags a self-transfer whose layover is below the extra MCT", () => {
    const flags = validateConnectionTimes([
      segment("JFK", "LHR", "2026-11-15T10:00:00Z", "2026-11-15T18:00:00Z", {
        ticketId: "ticket-a",
      }),
      segment("LHR", "CDG", "2026-11-15T20:00:00Z", "2026-11-15T21:10:00Z", {
        ticketId: "ticket-b",
      }),
    ]);

    expect(flags[0].selfTransfer).toBe(true);
    expect(flags[0].requiredMinutes).toBe(150);
    expect(flags[0].layoverMinutes).toBe(120);
    expect(flags[0].ok).toBe(false);
    expect(flags[0].reason).toBe("below_minimum");
    expect(hasInsufficientConnection(flags)).toBe(true);
  });

  it("uses the configured airport-pair minimum for JFK connections", () => {
    const flags = validateConnectionTimes([
      segment("BOS", "JFK", "2026-11-15T08:00:00Z", "2026-11-15T09:00:00Z"),
      segment("JFK", "LHR", "2026-11-15T10:00:00Z", "2026-11-15T18:30:00Z"),
    ]);

    expect(flags[0].requiredMinutes).toBe(
      DEFAULT_CONNECTION_TIME_CONFIG.pairMinutes!["JFK-JFK"],
    );
    expect(flags[0].layoverMinutes).toBe(60);
    expect(flags[0].ok).toBe(false);
    expect(flags[0].reason).toBe("below_minimum");
  });

  it("flags invalid timestamps instead of throwing", () => {
    const flags = validateConnectionTimes([
      segment("JFK", "LHR", "2026-11-15T10:00:00Z", "not-a-date"),
      segment("LHR", "CDG", "2026-11-15T20:00:00Z", "2026-11-15T21:00:00Z"),
    ]);

    expect(flags[0].ok).toBe(false);
    expect(flags[0].reason).toBe("invalid_times");
  });

  it("returns no flags for a direct itinerary", () => {
    expect(
      validateConnectionTimes([
        segment("JFK", "LAX", "2026-11-15T10:00:00Z", "2026-11-15T16:00:00Z"),
      ]),
    ).toEqual([]);
  });
});
