import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BookingConfirmationScreen from './BookingConfirmationScreen';

describe('BookingConfirmationScreen notification preferences', () => {
  const mockItinerary = [
    {
      flightNumber: 'TR101',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: '2025-06-01T08:00:00Z',
    },
  ];

  it('renders default notification preferences', () => {
    render(
      <BookingConfirmationScreen
        bookingId="12345"
        itinerary={mockItinerary}
        paymentStatus="paid"
        totalAmount="$500"
      />
    );

    expect(screen.getByText('Booking Update Notification Preferences')).toBeInTheDocument();
    expect(screen.getByText('push, email')).toBeInTheDocument();
  });

  it('invokes callback when updating notification preferences', () => {
    const handleUpdate = jest.fn();
    render(
      <BookingConfirmationScreen
        bookingId="12345"
        itinerary={mockItinerary}
        paymentStatus="paid"
        totalAmount="$500"
        notificationPreferences={['push']}
        onUpdateNotificationPreferences={handleUpdate}
      />
    );

    const button = screen.getByText('Enable All Channels');
    fireEvent.click(button);
    expect(handleUpdate).toHaveBeenCalledWith(['push', 'email', 'sms']);
  });
});
