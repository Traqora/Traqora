/**
 * Provider offer identifier tracking from search through confirmation (#914).
 *
 * Search results expose `providerOfferId`. Checkout persists it on the booking.
 * Confirmation returns the same id so provider-specific failures can be
 * correlated to the original offer.
 *
 * Expected behavior
 * -----------------
 * - A non-empty trimmed string is accepted and carried unchanged.
 * - Missing, blank, or non-string values fail with `MISSING_PROVIDER_OFFER_ID`.
 *
 * Failure cases
 * -------------
 * - Empty string, whitespace, `null`, and `undefined` are rejected.
 * - Confirmation without a stored offer id is rejected so a lost identifier
 *   cannot be silently omitted from operator tooling.
 */

export const MISSING_PROVIDER_OFFER_ID = "MISSING_PROVIDER_OFFER_ID";

export class MissingProviderOfferIdError extends Error {
  readonly code = MISSING_PROVIDER_OFFER_ID;

  constructor(message = "Missing provider offer identifier") {
    super(message);
    this.name = "MissingProviderOfferIdError";
  }
}

export function requireProviderOfferId(value: unknown): string {
  if (typeof value !== "string") {
    throw new MissingProviderOfferIdError();
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new MissingProviderOfferIdError();
  }
  return trimmed;
}

export interface OfferTrackedBooking {
  id: string;
  providerOfferId?: string | null;
  status?: string;
}

export interface BookingConfirmationPayload {
  bookingId: string;
  providerOfferId: string;
  status?: string;
}

/** Persist the search offer id onto a booking record. */
export function attachProviderOfferId<T extends { providerOfferId?: string | null }>(
  booking: T,
  offerId: unknown,
): T {
  booking.providerOfferId = requireProviderOfferId(offerId);
  return booking;
}

/** Build the confirmation payload; fails if the offer id was lost. */
export function confirmationWithOfferId(
  booking: OfferTrackedBooking,
): BookingConfirmationPayload {
  return {
    bookingId: booking.id,
    providerOfferId: requireProviderOfferId(booking.providerOfferId),
    status: booking.status,
  };
}
