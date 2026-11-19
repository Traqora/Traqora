import { formatAirportLocalTime } from '../utils/airportTimezones';
import {
  SelfTransferConnection,
  SelfTransferItinerary,
  SelfTransferSegment,
  SelfTransferSegmentInput,
  SeparateTicketRisk,
  TransferRiskLevel,
  explainSeparateTicketRisk,
  MAX_CONNECTION_LAYOVER_HOURS,
  SELF_TRANSFER_LAYOVER_THRESHOLDS,
  SELF_TRANSFER_MITIGATIONS,
  SEPARATE_TICKET_RISKS,
} from '../types/selfTransfer';

const MINUTE_MS = 60 * 1000;
const MAX_CONNECTION_LAYOVER_MS = MAX_CONNECTION_LAYOVER_HOURS * 60 * MINUTE_MS;

/**
 * Severity-grade a single connection. Separate tickets are never lower than
 * 'medium'; short layovers push the severity up.
 */
function connectionRiskLevel(connection: SelfTransferConnection): TransferRiskLevel {
  if (!connection.separateTickets) return 'low';
  if (connection.layoverMinutes < SELF_TRANSFER_LAYOVER_THRESHOLDS.severe) {
    return 'severe';
  }
  if (connection.layoverMinutes < SELF_TRANSFER_LAYOVER_THRESHOLDS.high) {
    return 'high';
  }
  return 'medium';
}

function riskLevelOrder(level: TransferRiskLevel): number {
  switch (level) {
    case 'severe':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function worseLevel(
  a: TransferRiskLevel,
  b: TransferRiskLevel
): TransferRiskLevel {
  return riskLevelOrder(a) >= riskLevelOrder(b) ? a : b;
}

function parseIso(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ISO-8601 timestamp: ${value}`);
  }
  return parsed;
}

/**
 * Label a set of flight bookings as a self-transfer itinerary where
 * applicable.
 *
 * Detection rules:
 *   - Segments are grouped by passenger email and ordered by departure time.
 *   - A connection exists when the arrival airport of one segment equals the
 *     departure airport of the next segment and the layover is within the
 *     default connection window (<= 24 hours).
 *   - The connection is a self-transfer when the two flights are on different
 *     booking references (separate tickets). When either reference is unknown
 *     we conservatively treat it as a separate ticket.
 *   - Same booking reference = single ticket = connection protected.
 *
 * @param inputs - Flight booking segments to label.
 * @param itineraryId - Optional caller-supplied itinerary identifier.
 * @returns A labeled itinerary with per-segment flags and an overall
 * separate-ticket risk explanation.
 */
export function analyzeItinerary(
  inputs: SelfTransferSegmentInput[],
  itineraryId?: string
): SelfTransferItinerary {
  const id = itineraryId ?? crypto.randomUUID();
  const generatedAt = new Date().toISOString();

  // Group by passenger and order each group by departure time.
  const byPassenger = new Map<string, SelfTransferSegmentInput[]>();
  for (const input of inputs) {
    const group = byPassenger.get(input.passengerEmail) ?? [];
    group.push(input);
    byPassenger.set(input.passengerEmail, group);
  }

  const segments: SelfTransferSegment[] = [];
  let separateTicketCount = 0;
  let unprotectedConnectionCount = 0;
  let overallRiskLevel: TransferRiskLevel = 'low';
  const passengerEmails = new Set<string>();

  for (const [email, group] of byPassenger) {
    passengerEmails.add(email);
    group.sort(
      (a, b) => parseIso(a.departure).getTime() - parseIso(b.departure).getTime()
    );

    for (let i = 0; i < group.length; i++) {
      const input = group[i];
      const departureLocal = formatAirportLocalTime(input.departure, input.fromAirport);
      const arrivalLocal = formatAirportLocalTime(input.arrival, input.toAirport);
      const segment: SelfTransferSegment = {
        bookingId: input.bookingId,
        bookingReference: input.bookingReference,
        passengerEmail: input.passengerEmail,
        flightNumber: input.flightNumber,
        airline: input.airline,
        fromAirport: input.fromAirport,
        toAirport: input.toAirport,
        departure: input.departure,
        arrival: input.arrival,
        sequence: segments.length + 1,
        riskLevel: 'low',
        riskExplanation: 'Standalone flight — no connection risk.',
        departureTimeZone: departureLocal.timeZone,
        arrivalTimeZone: arrivalLocal.timeZone,
        departureLocalTime: departureLocal.localTime,
        arrivalLocalTime: arrivalLocal.localTime,
      };

      if (i > 0) {
        const previous = group[i - 1];
        const previousArrival = parseIso(previous.arrival);
        const departure = parseIso(input.departure);
        const layoverMs = departure.getTime() - previousArrival.getTime();

        const isConnection =
          layoverMs > 0 &&
          layoverMs <= MAX_CONNECTION_LAYOVER_MS &&
          previous.toAirport.toUpperCase() === input.fromAirport.toUpperCase();

        if (isConnection) {
          const sameTicket =
            previous.bookingReference !== null &&
            input.bookingReference !== null &&
            previous.bookingReference === input.bookingReference;
          const separateTickets = !sameTicket;
          const connection: SelfTransferConnection = {
            layoverMinutes: Math.round(layoverMs / MINUTE_MS),
            separateTickets,
            connectionProtected: sameTicket,
            isSelfTransfer: separateTickets,
          };

          segment.connection = connection;
          if (separateTickets) {
            separateTicketCount += 1;
            unprotectedConnectionCount += 1;
            overallRiskLevel = worseLevel(
              overallRiskLevel,
              connectionRiskLevel(connection)
            );
            segment.riskLevel = connectionRiskLevel(connection);
            const previousArrivalLocal = formatAirportLocalTime(previous.arrival, previous.toAirport);
            segment.riskExplanation = `Self-transfer connection: arrives ${previous.toAirport} at ${previousArrivalLocal.localTime} and departs ${input.fromAirport} at ${departureLocal.localTime} on separate tickets (${previous.bookingReference ?? 'unknown'} → ${input.bookingReference ?? 'unknown'}). No missed-connection protection.`;
          } else {
            segment.riskLevel = 'low';
            segment.riskExplanation = `Single-ticket connection via ${input.fromAirport} (${connection.layoverMinutes} min layover) — protected by the airline if the first flight is delayed.`;
          }
        } else if (i > 0) {
          segment.riskExplanation =
            'No self-transfer connection from the previous flight (different airport or outside the connection window).';
        }
      }

      segments.push(segment);
    }
  }

  const isSelfTransfer = separateTicketCount > 0;
  if (!isSelfTransfer && segments.length > 0) {
    overallRiskLevel = 'low';
  }

  const risks: SeparateTicketRisk[] = isSelfTransfer
    ? SEPARATE_TICKET_RISKS.filter((risk) => risk.severity !== 'low')
    : [];

  const overallExplanation = explainSeparateTicketRisk(
    separateTicketCount,
    unprotectedConnectionCount
  );

  const itinerary: SelfTransferItinerary = {
    itineraryId: id,
    passengerEmail: Array.from(passengerEmails).join(', '),
    segments,
    isSelfTransfer,
    separateTicketCount,
    unprotectedConnectionCount,
    overallRiskLevel,
    overallExplanation,
    risks,
    mitigations: isSelfTransfer ? [...SELF_TRANSFER_MITIGATIONS] : [],
    generatedAt,
  };
  return itinerary;
}

/**
 * Returns the standing separate-ticket risks that apply to every
 * self-transfer itinerary.
 */
export function listSeparateTicketRisks(): SeparateTicketRisk[] {
  return [...SEPARATE_TICKET_RISKS];
}

export { analyzeItinerary as labelSelfTransferItinerary };

