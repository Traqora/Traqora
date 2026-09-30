import React from 'react';

interface ItinerarySegment {
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: string;
}

interface BookingConfirmationProps {
  bookingId: string;
  itinerary: ItinerarySegment[];
  paymentStatus: 'paid' | 'pending' | 'failed' | 'confirmed';
  totalAmount: string;
  transactionHash?: string;
  onViewDashboard?: () => void;
}

export default function BookingConfirmationScreen({
  bookingId,
  itinerary,
  paymentStatus,
  totalAmount,
  transactionHash,
  onViewDashboard,
}: BookingConfirmationProps) {
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
              <div className="flight-num">Flight {seg.flightNumber}</div>
              <div className="route">
                {seg.fromAirport} → {seg.toAirport}
              </div>
              <div className="time">Departure: {seg.departureTime}</div>
            </div>
          ))}
        </div>

        <button className="button" onClick={onViewDashboard}>
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
