import React, { useState, useEffect } from 'react';
import { View, Text, Button, AccessibilityInfo } from 'react-native';

interface CheckoutScreenProps {
  quote: {
    price: number;
    expiresAt: number;
  };
  onRefreshQuote: () => void;
  onCompleteCheckout: () => void;
}

export const CheckoutScreen: React.FC<CheckoutScreenProps> = ({ quote, onRefreshQuote, onCompleteCheckout }) => {
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = quote.expiresAt - currentTime;
  const isStale = remaining <= 0;
  const isCloseToExpiry = !isStale && remaining <= 300000;

  useEffect(() => {
    if (isCloseToExpiry || isStale) {
      const message = isStale 
        ? 'Quote has expired. Please refresh to continue.' 
        : 'Quote is close to expiry. Please complete checkout promptly.';
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [isCloseToExpiry, isStale]);

  return (
    <View>
      <Text>Total: ${quote.price}</Text>
      {isStale && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="assertive">
          Quote has expired. Please refresh to continue.
        </Text>
      )}
      {isCloseToExpiry && !isStale && (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite">
          Quote is close to expiry. Please complete checkout promptly.
        </Text>
      )}
      {isStale ? (
        <Button title="Refresh Quote" onPress={onRefreshQuote} />
      ) : (
        <Button title="Complete Checkout" onPress={onCompleteCheckout} />
      )}
    </View>
  );
};
