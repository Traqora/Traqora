import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface FlightSegment {
  flightId: string;
  departureTime: string;
  arrivalTime: string;
  originTimezone: string;
  destinationTimezone: string;
}

interface ItineraryScreenProps {
  flight: FlightSegment;
}

export const ItineraryScreen: React.FC<ItineraryScreenProps> = ({ flight }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Flight Itinerary & Time Zones</Text>
      <View style={styles.segmentContainer}>
        <Text testID="departure-time">
          Departure: {flight.departureTime} ({flight.originTimezone})
        </Text>
        <Text testID="arrival-time">
          Arrival: {flight.arrivalTime} ({flight.destinationTimezone})
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  segmentContainer: {
    gap: 8,
  },
});
