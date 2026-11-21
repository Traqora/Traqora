import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletConnectScreen } from '../../components/auth/WalletConnectScreen';
import { PaymentStatusScreen } from '../../components/booking/PaymentStatusScreen';

describe('WalletConnectScreen and PaymentStatusScreen', () => {
  it('renders wallet connect options correctly', () => {
    render(<WalletConnectScreen />);
    expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect with Freighter/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect with Albedo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect with Rabet/i })).toBeInTheDocument();
  });

  it('renders payment status success screen correctly', () => {
    render(<PaymentStatusScreen bookingId="bk-12345" initialStatus="success" txHash="tx-hash-abc" />);
    expect(screen.getByText('Payment Successful')).toBeInTheDocument();
    expect(screen.getByText('bk-12345')).toBeInTheDocument();
    expect(screen.getByText('View Transaction')).toBeInTheDocument();
  });

  it('renders payment status failed screen with retry guidance', () => {
    render(<PaymentStatusScreen bookingId="bk-99999" initialStatus="failed" errorMessage="Insufficient balance" />);
    expect(screen.getByText('Payment Failed')).toBeInTheDocument();
    expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
    expect(screen.getByText(/Retry Guidance:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry Payment/i })).toBeInTheDocument();
  });
});
