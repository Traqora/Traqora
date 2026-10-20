import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BiometricAuth } from '@/components/auth/BiometricAuth';
import '@testing-library/jest-dom';

describe('BiometricAuth Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders successfully with default props', () => {
    render(<BiometricAuth />);
    expect(screen.getByText('Biometric Authentication')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify Biometrics/i })).toBeInTheDocument();
  });

  it('handles successful biometric authentication happy path', async () => {
    const onSuccess = jest.fn();
    render(<BiometricAuth onSuccess={onSuccess} />);

    const verifyButton = screen.getByRole('button', { name: /Verify Biometrics/i });
    fireEvent.click(verifyButton);

    expect(screen.getByText('Verifying...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Authentication successful')).toBeInTheDocument();
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('handles failure mode when biometric authentication is not supported', async () => {
    const onError = jest.fn();
    render(<BiometricAuth isSupported={false} onError={onError} />);

    const verifyButton = screen.getByRole('button', { name: /Verify Biometrics/i });
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(screen.getByText('Biometric authentication is not supported on this device.')).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalledWith('Biometric authentication is not supported on this device.');
  });

  it('handles user cancellation correctly', async () => {
    const onCancel = jest.fn();
    render(<BiometricAuth onCancel={onCancel} />);

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
