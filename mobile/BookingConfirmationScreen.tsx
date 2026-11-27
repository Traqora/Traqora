import React from 'react';

interface ItinerarySegment {
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: string;
  /** Booking reference / PNR. When adjacent segments have different references,
   *  the connection is a self-transfer on separate tickets. */
  bookingReference?: string | null;
  /** True when this segment begins a self-transfer (separate-ticket) connection. */
  separateTicket?: boolean;
  /** IANA time zone of the departure airport. */
  departureTimeZone?: string;
  /** IANA time zone of the arrival airport. */
  arrivalTimeZone?: string;
  /** Departure rendered in airport-local time with an explicit zone label. */
  departureLocalTime?: string;
  /** Arrival rendered in airport-local time with an explicit zone label. */
  arrivalLocalTime?: string;
  /** Arrival instant (ISO-8601), used when arrivalLocalTime is not provided. */
  arrivalTime?: string;
}

function formatSegmentTime(localTime: string | undefined, isoTime: string, timeZone: string | undefined): string {
  const base = localTime ?? isoTime;
  return timeZone ? `${base} (${timeZone})` : base;
}

interface BookingConfirmationProps {
  bookingId: string;
  itinerary: ItinerarySegment[];
  paymentStatus: 'paid' | 'pending' | 'failed' | 'confirmed';
  totalAmount: string;
  transactionHash?: string;
  onViewDashboard?: () => void;
  /** Optional handler to download/export booking confirmation document. */
  onDownloadConfirmation?: () => void;
  /** Optional human-readable separate-ticket risk explanation. */
  selfTransferExplanation?: string;
}

export function areBookingPrerequisitesSatisfied(
  paymentStatus: 'paid' | 'pending' | 'failed' | 'confirmed',
  itinerary: ItinerarySegment[],
  transactionHash?: string
): boolean {
  const isPaidOrConfirmed = paymentStatus === 'paid' || paymentStatus === 'confirmed';
  const hasValidItinerary = Array.isArray(itinerary) && itinerary.length > 0 && itinerary.every((seg) => Boolean(seg.flightNumber && seg.fromAirport && seg.toAirport));
  const hasTxHash = Boolean(transactionHash && transactionHash.trim().length > 0);
  return isPaidOrConfirmed && hasValidItinerary && hasTxHash;
}

export default function BookingConfirmationScreen({
  bookingId,
  itinerary,
  paymentStatus,
  totalAmount,
  transactionHash,
  onViewDashboard,
  onDownloadConfirmation,
  selfTransferExplanation,
}: BookingConfirmationProps) {
  const hasSelfTransfer = itinerary.some((seg) => seg.separateTicket === true);

  return (
    <div className="booking-confirmation-container">
      <div className="content">
        <div className="header-container">
          <h1 className="success-title">Booking Confirmed!</h1>
          <p className="booking-ref">Reference: TRAQ-{bookingId}</p>
        </div>

        <div className="card">
          <h2 className="section-title">Payment Status</h2>
          <div className="status-row">
            <span className="label">Status:</span>
            <span className="value capitalize">{paymentStatus}</span>
          </div>
          <div className="status-row">
            <span className="label">Total Paid:</span>
            <span className="value">{totalAmount}</span>
          </div>
          {transactionHash && (
            <div className="status-row">
              <span className="label">Tx Hash:</span>
              <span className="tx-hash" title={transactionHash}>
                {transactionHash}
              </span>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="section-title">Itinerary</h2>
          {itinerary.map((seg, index) => (
            <div key={index} className="segment-container">
              <div className="flight-num">
                Flight {seg.flightNumber}
                {seg.separateTicket && (
                  <span className="self-transfer-badge">Separate ticket</span>
                )}
              </div>
              <div className="route">
                {seg.fromAirport} → {seg.toAirport}
              </div>
              <div className="time">
                Departure: {formatSegmentTime(seg.departureLocalTime, seg.departureTime, seg.departureTimeZone)}
              </div>
              {(seg.arrivalLocalTime || seg.arrivalTime) && (
                <div className="time">
                  Arrival: {formatSegmentTime(seg.arrivalLocalTime, seg.arrivalTime ?? '', seg.arrivalTimeZone)}
                </div>
              )}
              {seg.bookingReference && (
                <div className="ticket-ref">
                  Ticket: {seg.bookingReference}
                </div>
              )}
            </div>
          ))}
          {hasSelfTransfer && selfTransferExplanation && (
            <div className="self-transfer-notice">
              <p className="notice-title">⚠ Separate-ticket self-transfer</p>
              <p className="notice-text">{selfTransferExplanation}</p>
              <p className="notice-hint">
                Allow extra time between flights, collect and re-check your
                baggage, and consider travel insurance that covers missed
                connections.
              </p>
            </div>
          )}
        </div>

        <div className="action-buttons">
          {onDownloadConfirmation && (
            <button className="button secondary-button" onClick={onDownloadConfirmation}>
              Download Confirmation
            </button>
          )}
        <button className="button" onClick={onViewDashboard}>
          Go to Dashboard
        </button>
        </div>
      </div>
    </div>
  );
}
