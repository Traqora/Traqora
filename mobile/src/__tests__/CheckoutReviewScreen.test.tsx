import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CheckoutReviewScreen, {
  ItinerarySegment,
  TravelerDetails,
  QuoteDetails,
} from '../screens/CheckoutReviewScreen';

describe('CheckoutReviewScreen', () => {
  const sampleItinerary: ItinerarySegment[] = [
    {
      flightNumber: 'TRQ101',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: '2025-06-01 10:00',
      arrivalTime: '2025-06-01 13:00',
      airlineName: 'Stellar Airlines',
    },
  ];

  const sampleTraveler: TravelerDetails = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane.doe@example.com',
    phone: '+1555019876',
    passportNumber: 'A12345678',
  };

  const sampleQuote: QuoteDetails = {
    baseFare: '400.00',
    taxesAndFees: '50.00',
    totalAmount: '450.00',
    currency: 'USDC',
  };

  it('renders all section details correctly on normal path', () => {
    const { getByText } = render(
      <CheckoutReviewScreen
        itinerary={sampleItinerary}
        traveler={sampleTraveler}
        quote={sampleQuote}
        paymentMethod="Stellar Wallet (USDC)"
        onConfirmBooking={() => {}}
      />
    );

    expect(getByText('Review Your Booking')).toBeTruthy();
    expect(getByText('Flight TRQ101 (Stellar Airlines)')).toBeTruthy();
    expect(getByText('JFK → LAX')).toBeTruthy();
    expect(getByText('Departure: 2025-06-01 10:00')).toBeTruthy();
    expect(getByText('Arrival: 2025-06-01 13:00')).toBeTruthy();
    expect(getByText('Name: Jane Doe')).toBeTruthy();
    expect(getByText('Email: jane.doe@example.com')).toBeTruthy();
    expect(getByText('Phone: +1555019876')).toBeTruthy();
    expect(getByText('Passport: A12345678')).toBeTruthy();
    expect(getByText('Method: Stellar Wallet (USDC)')).toBeTruthy();
    expect(getByText('400.00 USDC')).toBeTruthy();
    expect(getByText('50.00 USDC')).toBeTruthy();
    expect(getByText('450.00 USDC')).toBeTruthy();
  });

  it('invokes onConfirmBooking callback when confirm button is pressed', () => {
    const onConfirmMock = jest.fn();
    const { getByText } = render(
      <CheckoutReviewScreen
        itinerary={sampleItinerary}
        traveler={sampleTraveler}
        quote={sampleQuote}
        paymentMethod="Stellar Wallet (USDC)"
        onConfirmBooking={onConfirmMock}
      />
    );

    fireEvent.press(getByText('Confirm & Pay'));
    expect(onConfirmMock).toHaveBeenCalledTimes(1);
  });

  it('invokes edit callbacks when edit buttons are pressed', () => {
    const onEditItinerary = jest.fn();
    const onEditTraveler = jest.fn();
    const onEditPayment = jest.fn();

    const { getAllByText } = render(
      <CheckoutReviewScreen
        itinerary={sampleItinerary}
        traveler={sampleTraveler}
        quote={sampleQuote}
        paymentMethod="Stellar Wallet (USDC)"
        onConfirmBooking={() => {}}
        onEditItinerary={onEditItinerary}
        onEditTraveler={onEditTraveler}
        onEditPayment={onEditPayment}
      />
    );

    const editButtons = getAllByText('Edit');
    expect(editButtons.length).toBe(3);

    fireEvent.press(editButtons[0]);
    expect(onEditItinerary).toHaveBeenCalledTimes(1);

    fireEvent.press(editButtons[1]);
    expect(onEditTraveler).toHaveBeenCalledTimes(1);

    fireEvent.press(editButtons[2]);
    expect(onEditPayment).toHaveBeenCalledTimes(1);
  });
});
