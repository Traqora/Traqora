/**
 * Booking detail UI state contract (issues #1145 and #1146).
 *
 * The v1 booking detail view renders exactly one meaningful state at a time.
 * `resolveBookingDetailState` is the single source of truth for which state
 * applies. It is deliberately pure: no fetches, no React, no raw API text.
 */

export type BookingDetailState =
  | "missing"
  | "unauthorized"
  | "pending"
  | "unavailable"
  | "ready";

export interface BookingDetailStateInput {
  /** HTTP status of the lookup, or null when the request succeeded. */
  httpStatus?: number | null;
  /** Stable error code from the API, when one is available. */
  errorCode?: string | null;
  /** Status field of the returned booking. */
  bookingStatus?: string | null;
  /** Whether a booking object was returned at all. Defaults to true. */
  hasBooking?: boolean;
}

const UNAUTHORIZED_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_OWNER",
  "BOOKING_ACCESS_DENIED",
]);

const MISSING_CODES = new Set(["NOT_FOUND", "BOOKING_NOT_FOUND"]);

/** Booking states that are real but not yet settled enough to show a full itinerary. */
export const PENDING_BOOKING_STATUSES = new Set([
  "created",
  "awaiting_payment",
  "payment_processing",
  "onchain_pending",
  "onchain_submitted",
]);

/**
 * Derive the detail state from the lookup result.
 *
 * Selection rules, in priority order:
 * 1. 401/403 or an ownership error code -> "unauthorized"
 * 2. 404 or a not-found error code      -> "missing"
 * 3. Any other non-2xx status or error code -> "unavailable"
 * 4. A returned booking still in a pending state -> "pending"
 * 5. No booking returned                 -> "missing"
 * 6. Otherwise                           -> "ready"
 *
 * Raw error messages are never consulted, so provider text or a rejected
 * payload cannot leak into the UI through this resolver.
 */
export function resolveBookingDetailState({
  httpStatus = null,
  errorCode = null,
  bookingStatus = null,
  hasBooking = true,
}: BookingDetailStateInput): BookingDetailState {
  const code = errorCode ? errorCode.toUpperCase() : null;

  if (httpStatus === 401 || httpStatus === 403 || (code && UNAUTHORIZED_CODES.has(code))) {
    return "unauthorized";
  }
  if (httpStatus === 404 || (code && MISSING_CODES.has(code))) {
    return "missing";
  }
  const hasErrorSignal =
    (httpStatus !== null && (httpStatus < 200 || httpStatus >= 300)) || code !== null;
  if (hasErrorSignal) return "unavailable";
  if (!hasBooking) return "missing";
  if (bookingStatus && PENDING_BOOKING_STATUSES.has(bookingStatus.toLowerCase())) {
    return "pending";
  }
  return "ready";
}

export interface BookingDetailStateCopy {
  title: string;
  description: string;
  actionLabel: string | null;
}

/**
 * Fixed, privacy-safe copy for every non-ready state. Callers must not append
 * API error text to these strings; the resolver intentionally discards it.
 */
export const BOOKING_DETAIL_STATE_COPY: Record<BookingDetailState, BookingDetailStateCopy> = {
  missing: {
    title: "Booking not found",
    description: "We could not find a booking with that reference. Check the reference and try again.",
    actionLabel: "Back to bookings",
  },
  unauthorized: {
    title: "You do not have access to this booking",
    description: "This booking belongs to a different account. Sign in with the account used to book it.",
    actionLabel: "Back to bookings",
  },
  pending: {
    title: "Booking is still being confirmed",
    description: "Your booking is being settled on the network. The full itinerary will appear here once it is confirmed.",
    actionLabel: null,
  },
  unavailable: {
    title: "Booking details are temporarily unavailable",
    description: "We could not load this booking right now. Please try again shortly.",
    actionLabel: "Try again",
  },
  ready: {
    title: "",
    description: "",
    actionLabel: null,
  },
};
