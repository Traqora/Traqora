/**
 * Self-transfer itinerary labeling and separate-ticket risk.
 *
 * A self-transfer itinerary is one where the traveler holds two or more
 * separate tickets (separate booking references / PNRs) for connecting
 * flights and is responsible for making the connection themselves.
 */

export type TransferRiskLevel = 'low' | 'medium' | 'high' | 'severe';

export interface SelfTransferSegmentInput {
  /** Booking record (ticket). */
  bookingId: string;
  /** Ticket / PNR reference. Null when unknown. */
  bookingReference: string | null;
  passengerEmail: string;
  flightNumber: string;
  airline: string;
  fromAirport: string;
  toAirport: string;
  departure: string; // ISO-8601
  arrival: string; // ISO-8601
}

export interface SelfTransferConnection {
  /** Minutes between the previous segment's arrival and this segment's departure. */
  layoverMinutes: number;
  /** True when the two flights are on different tickets (or a ticket is unknown). */
  separateTickets: boolean;
  /** True when both flights are on the same ticket (missed-connection protected). */
  connectionProtected: boolean;
  /** True when this segment begins a self-transfer connection. */
  isSelfTransfer: boolean;
}

export interface SelfTransferSegment {
  bookingId: string;
  bookingReference: string | null;
  passengerEmail: string;
  flightNumber: string;
  airline: string;
  fromAirport: string;
  toAirport: string;
  departure: string;
  arrival: string;
  sequence: number;
  connection?: SelfTransferConnection;
  riskLevel: TransferRiskLevel;
  riskExplanation: string;
  /** IANA time zone of the departure airport ('UTC' when unknown). */
  departureTimeZone: string;
  /** IANA time zone of the arrival airport ('UTC' when unknown). */
  arrivalTimeZone: string;
  /** Departure rendered in airport-local time with an explicit zone label. */
  departureLocalTime: string;
  /** Arrival rendered in airport-local time with an explicit zone label. */
  arrivalLocalTime: string;
}

export interface SeparateTicketRisk {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SelfTransferItinerary {
  itineraryId: string;
  passengerEmail: string;
  segments: SelfTransferSegment[];
  /** True when at least one connection is a self-transfer (separate tickets). */
  isSelfTransfer: boolean;
  /** Number of self-transfer connections in this itinerary. */
  separateTicketCount: number;
  /** Number of connections without missed-connection protection. */
  unprotectedConnectionCount: number;
  overallRiskLevel: TransferRiskLevel;
  /** Human-readable explanation of the separate-ticket risk for this itinerary. */
  overallExplanation: string;
  risks: SeparateTicketRisk[];
  mitigations: string[];
  generatedAt: string;
}

/**
 * Default connection window: layovers longer than this are treated as
 * stopovers rather than self-transfers.
 */
export const MAX_CONNECTION_LAYOVER_HOURS = 24;

/**
 * Layover thresholds (minutes) used to severity-grade self-transfer risk.
 */
export const SELF_TRANSFER_LAYOVER_THRESHOLDS = {
  severe: 30, // less than 30 min
  high: 60, // less than 60 min
} as const;

export const SEPARATE_TICKET_RISKS: SeparateTicketRisk[] = [
  {
    id: 'no-missed-connection-protection',
    title: 'No missed-connection protection',
    severity: 'high',
    description:
      'When flights are on separate tickets, each airline treats them as unrelated. If your first flight is delayed or cancelled, the operating airline is generally not obliged to rebook you on the second, separately ticketed flight, and you may have to buy a new ticket.',
  },
  {
    id: 'baggage-not-checked-through',
    title: 'Baggage is not checked through',
    severity: 'high',
    description:
      'On separate tickets, baggage is usually not interlined. You must collect your bags at the transfer airport, re-check them for the next flight, and clear security again — allow extra time.',
  },
  {
    id: 'separate-contracts',
    title: 'Separate contracts',
    severity: 'medium',
    description:
      'Each ticket is its own contract. A schedule change, cancellation, or refund on one ticket does not automatically apply to the other ticket.',
  },
  {
    id: 're-clear-security-immigration',
    title: 'Re-clear security and immigration',
    severity: 'medium',
    description:
      'Depending on the airport and country, you may need to clear immigration, customs, and security again between tickets, which can consume a large part of your layover.',
  },
  {
    id: 'no-through-check-in',
    title: 'Limited through check-in',
    severity: 'low',
    description:
      'You may not be able to check in for the second flight until you arrive at the transfer airport, and boarding passes for both flights may not be available at the start of your journey.',
  },
];

export const SELF_TRANSFER_MITIGATIONS = [
  'Allow at least 2 hours between self-transfer flights (3+ hours for international transfers involving immigration or a change of airport).',
  'Carry travel documents, medication, and essentials in cabin baggage in case checked bags miss the connection.',
  'Consider travel insurance that covers missed connections caused by separate tickets.',
  'Check visa and entry requirements for the transfer country — you may need to enter the country between tickets.',
  'Monitor the status of both flights separately; the airline will not protect the onward ticket.',
];

/**
 * Build the traveler-facing explanation of separate-ticket risk for an
 * itinerary that contains at least one self-transfer connection.
 */
export function explainSeparateTicketRisk(
  separateTicketCount: number,
  unprotectedConnectionCount: number
): string {
  if (separateTicketCount === 0) {
    return 'All connections in this itinerary are on the same ticket, so they are protected: if the first flight is delayed, the airline will rebook you on the next available flight and your baggage is checked through.';
  }
  return (
    `This itinerary contains ${separateTicketCount} self-transfer connection(s) on ` +
    `${unprotectedConnectionCount} separate ticket(s). Separate tickets are independent contracts: the airlines are not obliged to protect missed connections, baggage is not checked through automatically, and you may need to re-check bags and clear security again. ` +
    'Allow plenty of time between flights and consider travel insurance.'
  );
}
