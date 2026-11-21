import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

interface FinalTermsReviewProps {
  fareTerms: string;
  cancellationPolicy: string;
  onAccept: () => void;
  onCancel: () => void;
}

export const FinalTermsReview: React.FC<FinalTermsReviewProps> = ({
  fareTerms,
  cancellationPolicy,
  onAccept,
  onCancel,
}) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Final Terms & Cancellation Review</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fare Terms</Text>
        <Text style={styles.sectionText}>{fareTerms}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cancellation Policy</Text>
        <Text style={styles.sectionText}>{cancellationPolicy}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.acceptButton} onPress={onAccept} testID="accept-terms-button">
          <Text style={styles.acceptButtonText}>Authorize Payment & Book</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} testID="cancel-terms-button">
          <Text style={styles.cancelButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    color: '#444',
  },
  sectionText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  buttonContainer: {
    marginTop: 20,
    gap: 12,
  },
  acceptButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    backgroundColor: '#e5e5ea',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
  },
});
