import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Linking } from 'react-native';
import { searchMobileFlights } from '../api';
import { Flight } from '../../../packages/client/lib/api';

interface SearchScreenProps {
  onBack: () => void;
  bookingReference?: string;
  supportEmail?: string;
  supportPhone?: string;
}

export const DEFAULT_SUPPORT_EMAIL = 'support@example-airline.invalid';
export const DEFAULT_SUPPORT_PHONE = '+1-800-000-0000';

export function buildSupportMailto(bookingReference: string | undefined, supportEmail: string): string {
  const subject = bookingReference
    ? `Support request for booking ${bookingReference}`
    : 'Support request';
  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
}

export function buildSupportTel(supportPhone: string): string {
  return `tel:${supportPhone.replace(/[^+\d]/g, '')}`;
}

export default function SearchScreen({
  onBack,
  bookingReference,
  supportEmail = DEFAULT_SUPPORT_EMAIL,
  supportPhone = DEFAULT_SUPPORT_PHONE,
}: SearchScreenProps) {
  const [from, setFrom] = useState('JFK');
  const [to, setTo] = useState('LAX');
  const [date, setDate] = useState('2026-05-01');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await searchMobileFlights({ from, to, date, passengers: 1, class: 'economy' });
      setFlights(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back to home">
        <Text style={styles.backButtonText}>← Back to Home</Text>
      </TouchableOpacity>
      <Text style={styles.header}>Flight Search</Text>
      <View style={styles.form}>
        <TextInput style={styles.input} value={from} onChangeText={setFrom} placeholder="From (e.g. JFK)" accessibilityLabel="Departure airport" />
        <TextInput style={styles.input} value={to} onChangeText={setTo} placeholder="To (e.g. LAX)" accessibilityLabel="Arrival airport" />
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Date (YYYY-MM-DD)" accessibilityLabel="Travel date" />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch} accessibilityRole="button" accessibilityLabel="Search flights">
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator size="large" color="#d97706" style={{ marginTop: 20 }} />}
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}

      <View style={styles.supportCard} accessibilityLabel="Support contact">
        <Text style={styles.supportTitle}>Need help?</Text>
        {bookingReference ? (
          <Text style={styles.supportText}>Booking reference: {bookingReference}</Text>
        ) : null}
        <TouchableOpacity onPress={() => Linking.openURL(buildSupportMailto(bookingReference, supportEmail))} accessibilityRole="link" accessibilityLabel="Email support">
          <Text style={styles.supportLink}>Email: {supportEmail}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(buildSupportTel(supportPhone))} accessibilityRole="link" accessibilityLabel="Call support">
          <Text style={styles.supportLink}>Phone: {supportPhone}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={flights}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.flightCard}>
            <Text style={styles.airline}>{item.airline} - {item.id}</Text>
            <Text>{item.from} → {item.to} | ${item.price}</Text>
            <Text style={styles.time}>Departure: {item.departure_time}</Text>
          </View>
        )}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    paddingTop: 50,
    paddingHorizontal: 16,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    color: '#d97706',
    fontSize: 16,
    fontWeight: '500',
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  form: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#d97706',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  error: {
    color: '#dc2626',
    marginTop: 10,
  },
  supportCard: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  supportTitle: {
    fontWeight: '600',
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 4,
  },
  supportText: {
    color: '#374151',
    marginBottom: 4,
  },
  supportLink: {
    color: '#d97706',
    marginTop: 4,
  },
  listContainer: {
    paddingBottom: 20,
  },
  flightCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  airline: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1f2937',
  },
  time: {
    color: '#4b5563',
    marginTop: 4,
  },
});
