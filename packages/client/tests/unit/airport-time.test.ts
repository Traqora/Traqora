import { describe, it, expect } from "@jest/globals";
import {
  airportTimeZone,
  formatAirportClock,
  formatAirportDate,
  AIRPORT_TIMEZONES,
} from "../../lib/airport-time";

describe("airportTimeZone", () => {
  it("returns IANA time zone for known airports", () => {
    expect(airportTimeZone("JFK")).toBe("America/New_York");
    expect(airportTimeZone("LHR")).toBe("Europe/London");
    expect(airportTimeZone("LAX")).toBe("America/Los_Angeles");
    expect(airportTimeZone("DXB")).toBe("Asia/Dubai");
    expect(airportTimeZone("SYD")).toBe("Australia/Sydney");
  });

  it("is case-insensitive", () => {
    expect(airportTimeZone("jfk")).toBe("America/New_York");
    expect(airportTimeZone("lhr")).toBe("Europe/London");
    expect(airportTimeZone("LaX")).toBe("America/Los_Angeles");
  });

  it("trims whitespace", () => {
    expect(airportTimeZone("  JFK  ")).toBe("America/New_York");
  });

  it("returns UTC for unknown airports", () => {
    expect(airportTimeZone("XYZ")).toBe("UTC");
    expect(airportTimeZone("")).toBe("UTC");
  });

  it("returns UTC for null and undefined", () => {
    expect(airportTimeZone(null)).toBe("UTC");
    expect(airportTimeZone(undefined)).toBe("UTC");
  });
});

describe("formatAirportClock", () => {
  const fixedTime = "2026-09-01T12:00:00Z"; // noon UTC

  it("formats departure time in airport-local zone with explicit label", () => {
    const result = formatAirportClock(fixedTime, "JFK");
    // 12:00 UTC = 08:00 EDT (America/New_York, DST in September)
    expect(result.time).toBe("08:00");
    expect(result.zoneLabel).toBe("EDT");
    expect(result.timeZone).toBe("America/New_York");
  });

  it("formats arrival time in airport-local zone with explicit label", () => {
    const result = formatAirportClock(fixedTime, "LHR");
    // 12:00 UTC = 13:00 BST (Europe/London, DST in September)
    expect(result.time).toBe("13:00");
    expect(result.zoneLabel).toBe("BST");
    expect(result.timeZone).toBe("Europe/London");
  });

  it("formats LAX time with PDT label", () => {
    const result = formatAirportClock(fixedTime, "LAX");
    // 12:00 UTC = 05:00 PDT (America/Los_Angeles, DST in September)
    expect(result.time).toBe("05:00");
    expect(result.zoneLabel).toBe("PDT");
    expect(result.timeZone).toBe("America/Los_Angeles");
  });

  it("falls back to UTC for unknown airports", () => {
    const result = formatAirportClock(fixedTime, "XYZ");
    expect(result.timeZone).toBe("UTC");
    expect(result.zoneLabel).toBe("UTC");
  });

  it("returns unchanged timestamp for invalid date strings", () => {
    const result = formatAirportClock("not-a-date", "JFK");
    expect(result.time).toBe("not-a-date");
    expect(result.timeZone).toBe("America/New_York");
  });

  it("handles null/undefined airport codes by falling back to UTC", () => {
    const result = formatAirportClock(fixedTime, null);
    expect(result.timeZone).toBe("UTC");
    expect(result.zoneLabel).toBe("UTC");

    const result2 = formatAirportClock(fixedTime, undefined);
    expect(result2.timeZone).toBe("UTC");
    expect(result2.zoneLabel).toBe("UTC");
  });

  it("returns HH:mm time format", () => {
    const result = formatAirportClock("2026-09-01T05:30:00Z", "JFK");
    // 05:30 UTC = 01:30 EDT
    expect(result.time).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("formatAirportDate", () => {
  const fixedTime = "2026-09-01T12:00:00Z";

  it("formats calendar date in airport-local time zone", () => {
    const jfkDate = formatAirportDate(fixedTime, "JFK");
    const laxDate = formatAirportDate(fixedTime, "LAX");
    // 12:00 UTC on Sep 1 = 08:00 EDT Sep 1 at JFK, 05:00 PDT Sep 1 at LAX
    expect(jfkDate).toContain("Sep");
    expect(jfkDate).toContain("1");
    expect(laxDate).toContain("Sep");
    expect(laxDate).toContain("1");
  });

  it("handles date boundary crossing for timezone shifts", () => {
    // 23:00 UTC on Aug 31 = 19:00 EDT Aug 31 at JFK (still Aug 31)
    // but 01:00 UTC on Sep 1 = 21:00 EDT Aug 31 at JFK (day before)
    const lateAug = "2026-08-31T23:00:00Z";
    const jfkDate = formatAirportDate(lateAug, "JFK");
    expect(jfkDate).toContain("31");
  });

  it("falls back to raw timestamp for invalid dates", () => {
    const result = formatAirportDate("not-a-date", "JFK");
    expect(result).toBe("not-a-date");
  });
});

describe("AIRPORT_TIMEZONES", () => {
  it("covers major global airports", () => {
    expect(AIRPORT_TIMEZONES["JFK"]).toBeDefined();
    expect(AIRPORT_TIMEZONES["LHR"]).toBeDefined();
    expect(AIRPORT_TIMEZONES["DXB"]).toBeDefined();
    expect(AIRPORT_TIMEZONES["SIN"]).toBeDefined();
    expect(AIRPORT_TIMEZONES["SYD"]).toBeDefined();
    expect(AIRPORT_TIMEZONES["GRU"]).toBeDefined();
  });
});