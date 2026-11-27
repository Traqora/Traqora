import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

export interface BookingItem {
  id: string;
  bookingReference: string;
  route: string;
  departureTime: number;
  status: 'upcoming' | 'past' | 'cancelled' | 'confirmed';
}

interface BookingListScreenProps {
  bookings: BookingItem[];
  onSelectBooking?: (booking: BookingItem) => void;
}

export const BookingListScreen: React.FC<BookingListScreenProps> = ({
  bookings,
  onSelectBooking,
}) => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');

  const now = Math.floor(Date.now() / 1000);

  const filteredBookings = bookings.filter((b) => {
    const isUpcoming = b.departureTime >= now && b.status !== 'cancelled' && b.status !== 'past';
    return activeTab === 'upcoming' ? isUpcoming : !isUpcoming;
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Bookings</Text>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
          accessibilityRole="button"
          accessibilityLabel="Upcoming Bookings"
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>
            Upcoming
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'past' && styles.activeTab]}
          accessibilityRole="button"
          accessibilityLabel="Past Bookings"
          onPress={() => setActiveTab('past')}
        >
          <Text style={[styles.tabText, activeTab === 'past' && styles.activeTabText]}>
            Past
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredBookings}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => onSelectBooking && onSelectBooking(item)}
            accessibilityRole="button"
            accessibilityLabel={`Booking ${item.bookingReference}, route ${item.route}, status ${item.status}`}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.refText}>Ref: {item.bookingReference}</Text>
              <Text style={[styles.statusText, styles[item.status]]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.routeText}>Route: {item.route}</Text>
            <Text style={styles.timeText}>
              Departure: {new Date(item.departureTime * 1000).toLocaleString()}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No {activeTab} bookings found.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212529',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#007bff',
  },
  tabText: {
    fontSize: 16,
    color: '#6c757d',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#007bff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  refText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#343a40',
  },
  routeText: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    color: '#6c757d',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  upcoming: {
    color: '#28a745',
    backgroundColor: '#e6f4ea',
  },
  confirmed: {
    color: '#007bff',
    backgroundColor: '#e7f0fd',
  },
  past: {
    color: '#6c757d',
    backgroundColor: '#e9ecef',
  },
  cancelled: {
    color: '#dc3545',
    backgroundColor: '#fde8e8',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
  },
});
