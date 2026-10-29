import { UnprocessableEntityError } from '../utils/errors';

/**
 * Airline ticketing deadline (#906).
 *
 * The provider deadline is stored and shown as its own timestamp. It is
 * never copied from the flight departure time.
 *
 * A date-only lastTicketingDate (YYYY-MM-DD) is the end of that UTC day
 * (23:59:59.000Z), which stays distinct from a morning departure on the
 * same calendar date. A full timestamp is kept as that instant.
 *
 * Failure: the deadline string is present but not a date. The result is
 * null and, when persisting a booking, the request is rejected. Departure
 * is not substituted. Retry by sending a valid deadline timestamp.
 *
 * sameInstantAsDeparture is a warning for the UI. The two fields stay
 * separate even when the clock times match, and the client must label
 * the deadline "Ticket by".
 */

export interface TicketingDeadlineInput {
  lastTicketingDate?: string | null;
  lastTicketingDateTime?: string | null;
  departureTime: string;
}

export interface TicketingDeadlineResult {
  ticketingDeadline: string | null;
  departureTime: string;
  sameInstantAsDeparture: boolean;
}

function parseInstant(value: string, dateOnlyEndOfDay: boolean): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const iso = dateOnlyEndOfDay ? `${trimmed}T23:59:59.000Z` : `${trimmed}T00:00:00.000Z`;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveTicketingDeadline(input: TicketingDeadlineInput): TicketingDeadlineResult {
  const departure = parseInstant(input.departureTime, false);
  const departureTime = departure ? departure.toISOString() : input.departureTime;
  const raw = input.lastTicketingDateTime || input.lastTicketingDate;
  if (!raw) {
    return { ticketingDeadline: null, departureTime, sameInstantAsDeparture: false };
  }
  const deadline = parseInstant(raw, true);
  if (!deadline) {
    return { ticketingDeadline: null, departureTime, sameInstantAsDeparture: false };
  }
  return {
    ticketingDeadline: deadline.toISOString(),
    departureTime,
    sameInstantAsDeparture: departure ? deadline.getTime() === departure.getTime() : false,
  };
}

/**
 * Persist a caller-supplied deadline. Undefined/null means the provider
 * did not send one. An unreadable value is a validation error.
 */
export function resolveStoredTicketingDeadline(
  value: string | Date | null | undefined,
  departureTime: Date,
): Date | null {
  if (value == null || value === '') return null;
  const raw = value instanceof Date ? value.toISOString() : value;
  const resolved = resolveTicketingDeadline({
    lastTicketingDateTime: raw,
    departureTime: departureTime.toISOString(),
  });
  if (!resolved.ticketingDeadline) {
    throw new UnprocessableEntityError(
      'Ticketing deadline is not a valid timestamp. Departure time is not used in its place.',
      { field: 'ticketingDeadline' },
    );
  }
  return new Date(resolved.ticketingDeadline);
}
