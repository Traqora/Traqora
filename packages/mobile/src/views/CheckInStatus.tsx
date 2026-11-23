import React from 'react';
import { View, Text } from 'react-native';

export const CheckInStatus = ({ status }) => {
  // Fix: Mobile check-in status view
  return (
    <View>
      <Text>Your Check-in Status: {status || 'Pending'}</Text>
    </View>
  );
};
