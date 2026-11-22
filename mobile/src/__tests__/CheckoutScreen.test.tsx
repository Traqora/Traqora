import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CheckoutScreen } from '../CheckoutScreen';

describe('CheckoutScreen Quote Expiry', () => {
  it('renders normal path when quote is fresh', () => {
    const future = Date.now() + 600000;
    const { getByText, queryByText } = render(
      <CheckoutScreen 
        quote={{ price: 150, expiresAt: future }} 
        onRefreshQuote={() => {}}
        onCompleteCheckout={() => {}}
      />
    );
    expect(getByText('Total: $150')).toBeTruthy();
    expect(queryByText(/expired/i)).toBeNull();
  });

  it('shows expiry warning when close to expiry', () => {
    const closeTime = Date.now() + 60000;
    const { getByText } = render(
      <CheckoutScreen 
        quote={{ price: 150, expiresAt: closeTime }} 
        onRefreshQuote={() => {}}
        onCompleteCheckout={() => {}}
      />
    );
    expect(getByText(/close to expiry/i)).toBeTruthy();
  });

  it('prevents checkout and prompts refresh when stale', () => {
    const pastTime = Date.now() - 1000;
    const mockRefresh = jest.fn();
    const { getByText } = render(
      <CheckoutScreen 
        quote={{ price: 150, expiresAt: pastTime }} 
        onRefreshQuote={mockRefresh}
        onCompleteCheckout={() => {}}
      />
    );
    expect(getByText(/has expired/i)).toBeTruthy();
    const refreshButton = getByText('Refresh Quote');
    fireEvent.press(refreshButton);
    expect(mockRefresh).toHaveBeenCalled();
  });
});
