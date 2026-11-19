/**
 * Airline ticket numbers vs booking references (#905).
 *
 * A PNR / Traqora booking reference is not proof of ticketing. Ticket numbers
 * are stored separately and `isTicketed` is true only when at least one number
 * is present.
 */

export interface TicketedBookingView {
  bookingReference?: string | null;
  ticketNumbers?: string[] | null;
  status?: string | null;
}

export function normalizeTicketNumbers(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

export function isTicketed(booking: TicketedBookingView): boolean {
  return normalizeTicketNumbers(booking.ticketNumbers).length > 0;
}

export function presentTicketing(booking: TicketedBookingView) {
  const ticketNumbers = normalizeTicketNumbers(booking.ticketNumbers);
  return {
    bookingReference: booking.bookingReference ?? null,
    ticketNumbers,
    ticketed: ticketNumbers.length > 0,
    reservationConfirmed: booking.status === "confirmed",
  };
}
