import React from 'react';
import { render, screen } from '@testing-library/react';
import BookingConfirmationScreen, { areBookingPrerequisitesSatisfied } from '../BookingConfirmationScreen';

describe('BookingConfirmationScreen', () => {
  const sampleItinerary = [
    {
      flightNumber: 'TRQ101',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: '2025-06-01 10:00',
    },
  ];

  it('renders booking confirmation details correctly when prerequisites are met', () => {
    render(
      <BookingConfirmationScreen
        bookingId="12345"
        itinerary={sampleItinerary}
        paymentStatus="confirmed"
        totalAmount="$450.00"
        transactionHash="abc123def456"
      />
    );

    expect(screen.getByText('Booking Confirmed!')).toBeInTheDocument();
    expect(screen.getByText('Reference: TRAQ-12345')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText('$450.00')).toBeInTheDocument();
    expect(screen.getByText('Flight TRQ101')).toBeInTheDocument();
    expect(screen.getByText('JFK → LAX')).toBeInTheDocument();
    expect(screen.getByText('abc123def456')).toBeInTheDocument();
  });
it('validates prerequisites helper correctly for normal and failure paths', () => {
    expect(areBookingPrerequisitesSatisfied('confirmed', sampleItinerary, 'txhash123')).toBe(true);
    expect(areBookingPrerequisitesSatisfied('paid', sampleItinerary, 'txhash123')).toBe(true);
    expect(areBookingPrerequisitesSatisfied('pending', sampleItinerary, 'txhash123')).toBe(false);
    expect(areBookingPrerequisitesSatisfied('failed', sampleItinerary, 'txhash123')).toBe(false);
    expect(areBookingPrerequisitesSatisfied('confirmed', [], 'txhash123')).toBe(false);
    expect(areBookingPrerequisitesSatisfied('confirmed', sampleItinerary, undefined)).toBe(false);
  });

  it('renders download confirmation button and handles download action', () => {
    const handleDownload = jest.fn();
    render(
      <BookingConfirmationScreen
        bookingId="12345"
        itinerary={sampleItinerary}
        paymentStatus="confirmed"
        totalAmount="$450.00"
        onDownloadConfirmation={handleDownload}
      />
    );

    const downloadButton = screen.getByRole('button', { name: /Download Confirmation/i });
    expect(downloadButton).toBeInTheDocument();
    downloadButton.click();
    expect(handleDownload).toHaveBeenCalledTimes(1);
  });
});
