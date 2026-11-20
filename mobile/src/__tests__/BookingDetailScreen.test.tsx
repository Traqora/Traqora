import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BookingDetailScreen } from '../screens/BookingDetailScreen';

describe('BookingDetailScreen', () => {
  const mockBooking = {
    bookingId: '1001',
    itinerary: {
      flightNumber: 'FL123',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: 1704067200,
    },
    passenger: {
      name: 'Jane Doe',
      email: 'jane@example.com',
      seat: '12A',
    },
    paymentState: 'confirmed' as const,
    amount: '100 USDC',
    supplierReferencePolicy: 'Supplier ticket reference issued upon settlement.',
    cancellationTerms: 'Free cancellation up to 24 hours before departure.',
  };

  it('renders all booking details correctly', () => {
    const { getByText, getByTestId } = render(<BookingDetailScreen {...mockBooking} />);

    expect(getByText('Booking Detail #1001')).toBeTruthy();
    expect(getByTestId('itinerary-section')).toBeTruthy();
    expect(getByText('Flight: FL123')).toBeTruthy();
    expect(getByTestId('passenger-section')).toBeTruthy();
    expect(getByText('Name: Jane Doe')).toBeTruthy();
    expect(getByTestId('payment-section')).toBeTruthy();
    expect(getByText('State: CONFIRMED')).toBeTruthy();
    expect(getByTestId('supplier-section')).toBeTruthy();
    expect(getByText(mockBooking.supplierReferencePolicy)).toBeTruthy();
    expect(getByTestId('cancellation-section')).toBeTruthy();
    expect(getByText(mockBooking.cancellationTerms)).toBeTruthy();
  });

  it('triggers back and cancel callbacks when provided', () => {
    const onBack = jest.fn();
    const onCancelBooking = jest.fn();
    const pendingBooking = { ...mockBooking, paymentState: 'pending' as const };

    const { getByTestId } = render(
      <BookingDetailScreen
        {...pendingBooking}
        onBack={onBack}
        onCancelBooking={onCancelBooking}
      />
    );

    fireEvent.press(getByTestId('back-button'));
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.press(getByTestId('cancel-booking-button'));
    expect(onCancelBooking).toHaveBeenCalledTimes(1);
  });
});
