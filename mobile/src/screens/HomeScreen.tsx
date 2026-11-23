import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';

interface HomeScreenProps {
  onNavigateSearch: () => void;
}

export default function HomeScreen({ onNavigateSearch }: HomeScreenProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Traqora Mobile</Text>
      <Text style={styles.subtitle}>Decentralized Travel Booking on Stellar</Text>
      <TouchableOpacity style={styles.button} onPress={onNavigateSearch}>
        <Text style={styles.buttonText}>Search Flights</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#d97706',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 32,
  },
  button: {
    backgroundColor: '#d97706',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
