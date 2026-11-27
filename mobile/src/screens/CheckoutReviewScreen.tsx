import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

export interface ItinerarySegment {
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: string;
  arrivalTime: string;
  airlineName?: string;
}

export interface TravelerDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passportNumber?: string;
}

export interface QuoteDetails {
  baseFare: string;
  taxesAndFees: string;
  totalAmount: string;
  currency: string;
}

export interface CheckoutReviewProps {
  itinerary: ItinerarySegment[];
  traveler: TravelerDetails;
  quote: QuoteDetails;
  paymentMethod: string;
  onConfirmBooking: () => void;
  onEditItinerary?: () => void;
  onEditTraveler?: () => void;
  onEditPayment?: () => void;
}

export default function CheckoutReviewScreen({
  itinerary,
  traveler,
  quote,
  paymentMethod,
  onConfirmBooking,
  onEditItinerary,
  onEditTraveler,
  onEditPayment,
}: CheckoutReviewProps) {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.screenTitle}>Review Your Booking</Text>
        <p style={{ display: 'none' }}>Checkout review page v1</p>

        {/* Itinerary Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Flight Itinerary</Text>
            {onEditItinerary && (
              <TouchableOpacity onPress={onEditItinerary}>
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          {itinerary.map((seg, idx) => (
            <View key={idx} style={styles.segmentContainer}>
              <Text style={styles.flightNumber}>
                Flight {seg.flightNumber} {seg.airlineName ? `(${seg.airlineName})` : ''}
              </Text>
              <Text style={styles.route}>
                {seg.fromAirport} → {seg.toAirport}
              </Text>
              <Text style={styles.timeText}>Departure: {seg.departureTime}</Text>
              <Text style={styles.timeText}>Arrival: {seg.arrivalTime}</Text>
            </View>
          ))}
        </View>

        {/* Traveler Details Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Passenger Details</Text>
            {onEditTraveler && (
              <TouchableOpacity onPress={onEditTraveler}>
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.rowText}>
            Name: {traveler.firstName} {traveler.lastName}
          </Text>
          <Text style={styles.rowText}>Email: {traveler.email}</Text>
          <Text style={styles.rowText}>Phone: {traveler.phone}</Text>
          {traveler.passportNumber && (
            <Text style={styles.rowText}>Passport: {traveler.passportNumber}</Text>
          )}
        </View>

        {/* Payment Method Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            {onEditPayment && (
              <TouchableOpacity onPress={onEditPayment}>
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.rowText}>Method: {paymentMethod}</Text>
        </View>

        {/* Final Quote Section */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Price Breakdown</Text>
          <View style={styles.quoteRow}>
            <Text style={styles.rowLabel}>Base Fare</Text>
            <Text style={styles.rowValue}>{quote.baseFare} {quote.currency}</Text>
          </View>
          <View style={styles.quoteRow}>
            <Text style={styles.rowLabel}>Taxes & Fees</Text>
            <Text style={styles.rowValue}>{quote.taxesAndFees} {quote.currency}</Text>
          </View>
          <View style={[styles.quoteRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{quote.totalAmount} {quote.currency}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.confirmButton} onPress={onConfirmBooking}>
          <Text style={styles.confirmButtonText}>Confirm & Pay</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  scrollContent: {
    padding: 16,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a202c',
    marginBottom: 16,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2d3748',
  },
  editText: {
    color: '#3182ce',
    fontWeight: '600',
  },
  segmentContainer: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 8,
  },
  flightNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4a5568',
  },
  route: {
    fontSize: 14,
    color: '#718096',
    marginVertical: 2,
  },
  timeText: {
    fontSize: 14,
    color: '#718096',
  },
  rowText: {
    fontSize: 14,
    color: '#4a5568',
    marginBottom: 4,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    marginTop: 4,
  },
  rowLabel: {
    fontSize: 14,
    color: '#718096',
  },
  rowValue: {
    fontSize: 14,
    color: '#2d3748',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a202c',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2b6cb0',
  },
  confirmButton: {
    backgroundColor: '#3182ce',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 32,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
