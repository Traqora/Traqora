import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { BookingListScreen, BookingItem } from '../booking/BookingListScreen';

describe('BookingListScreen', () => {
  const futureTime = Math.floor(Date.now() / 1000) + 100000;
  const pastTime = Math.floor(Date.now() / 1000) - 100000;

  const mockBookings: BookingItem[] = [
    {
      id: '1',
      bookingReference: 'TRQ-UPCOMING',
      route: 'JFK -> LAX',
      departureTime: futureTime,
      status: 'confirmed',
    },
    {
      id: '2',
      bookingReference: 'TRQ-PAST',
      route: 'SFO -> SEA',
      departureTime: pastTime,
      status: 'past',
    },
  ];

  it('renders upcoming bookings by default', () => {
    const { getByText, queryByText } = render(<BookingListScreen bookings={mockBookings} />);
    expect(getByText('TRQ-UPCOMING')).toBeTruthy();
    expect(getByText('Route: JFK -> LAX')).toBeTruthy();
    expect(queryByText('TRQ-PAST')).toBeNull();
  });

  it('switches to past bookings tab and displays past bookings', () => {
    const { getByLabelText, getByText, queryByText } = render(
      <BookingListScreen bookings={mockBookings} />
    );

    const pastTab = getByLabelText('Past Bookings');
    fireEvent.press(pastTab);

    expect(getByText('TRQ-PAST')).toBeTruthy();
    expect(getByText('Route: SFO -> SEA')).toBeTruthy();
    expect(queryByText('TRQ-UPCOMING')).toBeNull();
  });

  it('triggers onSelectBooking when a booking card is pressed', () => {
    const handleSelect = jest.fn();
    const { getByText } = render(
      <BookingListScreen bookings={mockBookings} onSelectBooking={handleSelect} />
    );

    fireEvent.press(getByText('TRQ-UPCOMING'));
    expect(handleSelect).toHaveBeenCalledWith(mockBookings[0]);
  });
});
