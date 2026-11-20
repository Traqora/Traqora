import React from 'react';
import CheckoutReviewScreen, {
  ItinerarySegment,
  TravelerDetails,
  QuoteDetails,
} from '../src/screens/CheckoutReviewScreen';

export default function CheckoutRoute() {
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

  return (
    <CheckoutReviewScreen
      itinerary={sampleItinerary}
      traveler={sampleTraveler}
      quote={sampleQuote}
      paymentMethod="Stellar Wallet (USDC)"
      onConfirmBooking={() => {
        // Handle checkout confirmation action
      }}
    />
  );
}
