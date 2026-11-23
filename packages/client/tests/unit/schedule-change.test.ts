/**
 * Supplier schedule change normalization (issue #1145).
 * Pure boundary tests: no React, no network, no jsdom.
 */

import { normalizeScheduleChanges, ScheduleChange } from "@/components/booking/schedule-change";

function validChange(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "change-1",
    flightNumber: "DL 1234",
    originalDeparture: "2026-12-15T08:30:00Z",
    revisedDeparture: "2026-12-15T09:45:00Z",
    verifiedBy: "provider",
    verifiedAt: "2026-11-20T10:00:00Z",
    reason: "Carrier schedule adjustment",
    providerOfferId: "offer-abc",
    ...overrides,
  };
}

describe("normalizeScheduleChanges (issue #1145)", () => {
  it("accepts a fully verified supplier change", () => {
    const result = normalizeScheduleChanges([validChange()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "change-1",
      flightNumber: "DL 1234",
      originalDeparture: "2026-12-15T08:30:00Z",
      revisedDeparture: "2026-12-15T09:45:00Z",
      verifiedBy: "provider",
      verifiedAt: "2026-11-20T10:00:00Z",
      reason: "Carrier schedule adjustment",
      providerOfferId: "offer-abc",
    });
  });

  it.each([
    ["missing verification", { verifiedBy: undefined }],
    ["untrusted verification source", { verifiedBy: "passenger" }],
    ["missing id", { id: "" }],
    ["missing flight number", { flightNumber: "  " }],
    ["missing original departure", { originalDeparture: null }],
    ["missing revised departure", { revisedDeparture: "" }],
    ["unparseable verification date", { verifiedAt: "not-a-date" }],
    ["no actual change", { revisedDeparture: "2026-12-15T08:30:00Z" }],
  ])("drops an entry with %s", (_description, override) => {
    expect(normalizeScheduleChanges([validChange(override)])).toEqual([]);
  });

  it("drops non-object and array entries without throwing", () => {
    expect(normalizeScheduleChanges([null, "text", 42, [], validChange()])).toHaveLength(1);
  });

  it("keeps only the first 20 changes", () => {
    const input = Array.from({ length: 30 }, (_, i) => validChange({ id: `change-${i}` }));
    const result = normalizeScheduleChanges(input);
    expect(result).toHaveLength(20);
    expect(result[0].id).toBe("change-0");
    expect(result[19].id).toBe("change-19");
  });

  it("collapses control characters and whitespace in free text", () => {
    const result = normalizeScheduleChanges([
      validChange({ reason: "Carrier\r\nmoved\n the   flight" }),
    ]);
    expect(result[0].reason).toBe("Carrier moved the flight");
  });

  it("bounds long reason and identifier fields", () => {
    const result = normalizeScheduleChanges([
      validChange({ reason: "x".repeat(500), flightNumber: "y".repeat(200) }),
    ]);
    expect(result[0].reason?.length).toBe(203);
    expect(result[0].reason?.endsWith("...")).toBe(true);
    expect(result[0].flightNumber.length).toBe(83);
  });

  it("returns an empty list for non-array input", () => {
    expect(normalizeScheduleChanges(undefined as unknown as [])).toEqual([]);
    expect(normalizeScheduleChanges("nope" as unknown as [])).toEqual([]);
  });

  it("always marks accepted entries as provider verified", () => {
    const result: ScheduleChange[] = normalizeScheduleChanges([validChange()]);
    expect(result[0].verifiedBy).toBe("provider");
  });
});
