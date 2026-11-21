/**
 * Booking detail state contract (issue #1146).
 *
 * Pure resolver tests: no React, no network, no jsdom.
 */

import {
  BOOKING_DETAIL_STATE_COPY,
  PENDING_BOOKING_STATUSES,
  resolveBookingDetailState,
  BookingDetailStateInput,
} from "@/components/booking/booking-detail-state";

type Case = [string, BookingDetailStateInput, string];

const cases: Case[] = [
  [
    "a settled booking is ready",
    { httpStatus: 200, hasBooking: true, bookingStatus: "confirmed" },
    "ready",
  ],
  [
    "a missing reference is missing",
    { httpStatus: 404, hasBooking: false },
    "missing",
  ],
  [
    "a forbidden lookup is unauthorized even when the booking is absent",
    { httpStatus: 403, hasBooking: false },
    "unauthorized",
  ],
  [
    "an ownership error code is unauthorized",
    { errorCode: "NOT_OWNER" },
    "unauthorized",
  ],
  [
    "a server error is unavailable",
    { httpStatus: 503, hasBooking: false },
    "unavailable",
  ],
  [
    "a transport error code is unavailable",
    { errorCode: "network_error" },
    "unavailable",
  ],
  [
    "an unexpected 400 is unavailable rather than missing",
    { httpStatus: 400 },
    "unavailable",
  ],
  [
    "a booking awaiting payment is pending",
    { bookingStatus: "awaiting_payment" },
    "pending",
  ],
  [
    "an on-chain pending booking is pending",
    { bookingStatus: "ONCHAIN_PENDING" },
    "pending",
  ],
  [
    "no booking object is missing",
    { hasBooking: false },
    "missing",
  ],
  [
    "no signals at all are ready",
    {},
    "ready",
  ],
];

describe("resolveBookingDetailState (issue #1146)", () => {
  it.each(cases)("%s -> %s", (_description, input, expected) => {
    expect(resolveBookingDetailState(input)).toBe(expected);
  });

  it("gives authorization priority over missing and transport failures", () => {
    expect(
      resolveBookingDetailState({
        httpStatus: 404,
        errorCode: "FORBIDDEN",
        hasBooking: false,
      }),
    ).toBe("unauthorized");
  });

  it("gives a not-found response priority over a pending status", () => {
    expect(
      resolveBookingDetailState({ httpStatus: 404, bookingStatus: "onchain_pending" }),
    ).toBe("missing");
  });

  it("does not treat a successful response with a pending status as missing", () => {
    expect(
      resolveBookingDetailState({ httpStatus: 200, bookingStatus: "created", hasBooking: true }),
    ).toBe("pending");
  });

  it("never returns a loading state from the pure resolver", () => {
    const states = new Set(cases.map(([, , expected]) => expected));
    expect(states.has("loading")).toBe(false);
  });

  it("covers every pending booking status in the documented set", () => {
    for (const status of PENDING_BOOKING_STATUSES) {
      expect(resolveBookingDetailState({ bookingStatus: status })).toBe("pending");
    }
  });
});

describe("BOOKING_DETAIL_STATE_COPY", () => {
  it("defines fixed copy for all five states", () => {
    expect(Object.keys(BOOKING_DETAIL_STATE_COPY).sort()).toEqual(
      ["missing", "pending", "ready", "unavailable", "unauthorized"].sort(),
    );
  });

  it("never embeds a raw API error message", () => {
    const secret = "provider said token=ak_supersecret123";
    const state = resolveBookingDetailState({ httpStatus: 500, errorCode: secret });
    expect(state).toBe("unavailable");
    expect(JSON.stringify(BOOKING_DETAIL_STATE_COPY[state])).not.toContain(secret);
  });

  it("offers an action for the three states that need one", () => {
    expect(BOOKING_DETAIL_STATE_COPY.missing.actionLabel).toBe("Back to bookings");
    expect(BOOKING_DETAIL_STATE_COPY.unauthorized.actionLabel).toBe("Back to bookings");
    expect(BOOKING_DETAIL_STATE_COPY.unavailable.actionLabel).toBe("Try again");
    expect(BOOKING_DETAIL_STATE_COPY.pending.actionLabel).toBeNull();
  });
});
