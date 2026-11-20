import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';

export interface BookingDetailProps {
  bookingId: string;
  itinerary: {
    flightNumber: string;
    fromAirport: string;
    toAirport: string;
    departureTime: number;
  };
  passenger: {
    name: string;
    email: string;
    seat: string;
  };
  paymentState: 'pending' | 'confirmed' | 'completed' | 'refunded';
  amount: string;
  supplierReferencePolicy: string;
  cancellationTerms: string;
  onBack?: () => void;
  onCancelBooking?: () => void;
}

export const BookingDetailScreen: React.FC<BookingDetailProps> = ({
  bookingId,
  itinerary,
  passenger,
  paymentState,
  amount,
  supplierReferencePolicy,
  cancellationTerms,
  onBack,
  onCancelBooking,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backButton} testID="back-button">
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.header}>Booking Detail #{bookingId}</Text>

      <View style={styles.section} testID="itinerary-section">
        <Text style={styles.sectionTitle}>Saved Itinerary</Text>
        <Text>Flight: {itinerary.flightNumber}</Text>
        <Text>Route: {itinerary.fromAirport} → {itinerary.toAirport}</Text>
        <Text>Departure: {new Date(itinerary.departureTime * 1000).toLocaleString()}</Text>
      </View>

      <View style={styles.section} testID="passenger-section">
        <Text style={styles.sectionTitle}>Passenger Summary</Text>
        <Text>Name: {passenger.name}</Text>
        <Text>Email: {passenger.email}</Text>
        <Text>Seat: {passenger.seat}</Text>
      </View>

      <View style={styles.section} testID="payment-section">
        <Text style={styles.sectionTitle}>Payment State</Text>
        <Text style={styles.paymentStateText}>State: {paymentState.toUpperCase()}</Text>
        <Text>Amount: {amount}</Text>
      </View>

      <View style={styles.section} testID="supplier-section">
        <Text style={styles.sectionTitle}>Supplier Reference Policy</Text>
        <Text>{supplierReferencePolicy}</Text>
      </View>

      <View style={styles.section} testID="cancellation-section">
        <Text style={styles.sectionTitle}>Cancellation Terms</Text>
        <Text>{cancellationTerms}</Text>
      </View>

      {onCancelBooking && paymentState === 'pending' && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancelBooking} testID="cancel-booking-button">
          <Text style={styles.cancelButtonText}>Cancel Booking & Request Refund</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    padding: 16,
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1a1a1a',
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333333',
  },
  paymentStateText: {
    fontWeight: 'bold',
    color: '#007AFF',
  },
  cancelButton: {
    backgroundColor: '#dc3545',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  cancelButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
