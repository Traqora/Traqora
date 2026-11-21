import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';

export default function CheckoutScreen() {
  const [fullName, setFullName] = useState('');
  const [passport, setPassport] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!fullName || !passport) {
      setError('Please fix the following errors: All fields are required.');
      return;
    }
    setError('');
  };

  return (
    <View style={styles.container}>
      {error ? (
        <Text accessibilityRole="alert" style={styles.errorText}>
          {error}
        </Text>
      ) : null}
      <Text>Passenger Details & Checkout</Text>
      <TextInput
        accessibilityLabel="Full Name"
        accessibilityRole="text"
        importantForAccessibility="yes"
        placeholder="Full Name"
        value={fullName}
        onChangeText={setFullName}
      />
      <TextInput
        accessibilityLabel="Passport Number"
        accessibilityRole="text"
        importantForAccessibility="yes"
        placeholder="Passport Number"
        value={passport}
        onChangeText={setPassport}
      />
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Complete Checkout"
        accessible={true}
        onPress={handleSubmit}
      >
        <Text>Complete Checkout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20 },
  errorText: { color: 'red', marginBottom: 10 },
});
