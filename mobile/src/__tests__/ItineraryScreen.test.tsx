import React from 'react';
import { render } from '@testing-library/react-native';
import { ItineraryScreen } from '../screens/ItineraryScreen';

describe('ItineraryScreen Time-Zone Display', () => {
  it('displays flight times in airport local times with applicable time zones', () => {
    const sampleFlight = {
      flightId: 'TRQ100',
      departureTime: '10:00 AM',
      arrivalTime: '02:00 PM',
      originTimezone: 'UTC-5',
      destinationTimezone: 'UTC+1',
    };

    const { getByTestId } = render(<ItineraryScreen flight={sampleFlight} />);

    const departure = getByTestId('departure-time');
    const arrival = getByTestId('arrival-time');

    expect(departure.props.children).toContain('10:00 AM');
    expect(departure.props.children).toContain('UTC-5');

    expect(arrival.props.children).toContain('02:00 PM');
    expect(arrival.props.children).toContain('UTC+1');
  });
});
