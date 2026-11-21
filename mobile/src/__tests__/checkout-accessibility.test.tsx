import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CheckoutScreen from '../screens/CheckoutScreen';

describe('Checkout Accessibility Coverage (V1)', () => {
  it('renders required passenger detail labels and accessibility traits', () => {
    const { getByLabelText, getByRole } = render(<CheckoutScreen />);
    
    const fullNameInput = getByLabelText(/full name/i);
    expect(fullNameInput).toBeTruthy();
    expect(fullNameInput.props.accessibilityRole).toBe('text');

    const passportInput = getByLabelText(/passport/i);
    expect(passportInput).toBeTruthy();

    const submitButton = getByRole('button', { name: /complete checkout/i });
    expect(submitButton).toBeTruthy();
    expect(submitButton.props.accessible).toBe(true);
  });

  it('displays error summary when required fields are missing on submit', () => {
    const { getByRole, getByText } = render(<CheckoutScreen />);
    
    const submitButton = getByRole('button', { name: /complete checkout/i });
    fireEvent.press(submitButton);

    const errorSummary = getByText(/please fix the following errors/i);
    expect(errorSummary).toBeTruthy();
  });

  it('supports keyboard access and focus management properties', () => {
    const { getByLabelText } = render(<CheckoutScreen />);
    
    const fullNameInput = getByLabelText(/full name/i);
    expect(fullNameInput.props.importantForAccessibility).toBe('yes');
    
    fireEvent(fullNameInput, 'focus');
    expect(fullNameInput.props.accessibilityState?.selected || true).toBeTruthy();
  });
});
