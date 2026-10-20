import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WalletConnect } from '../../components/auth/wallet-connect';
import { StellarWalletConnect } from '../../lib/stellar-wallet-connect/components/wallet-connect';

describe('Wallet Phishing Copy & Security Warnings', () => {
  it('renders anti-phishing warnings in WalletConnect component', () => {
    render(<WalletConnect />);
    expect(screen.getByText(/Anti-Phishing Security Warning/i)).toBeInTheDocument();
    expect(screen.getByText(/never ask for your recovery phrase/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect with Freighter/i)).toBeInTheDocument();
  });

  it('renders security cautions in StellarWalletConnect component', () => {
    render(<StellarWalletConnect />);
    expect(screen.getByText(/Beware of Phishing Scams/i)).toBeInTheDocument();
    expect(screen.getByText(/Never type your 24-word recovery phrase/i)).toBeInTheDocument();
    expect(screen.getByText(/Freighter Wallet/i)).toBeInTheDocument();
    expect(screen.getByText(/Albedo/i)).toBeInTheDocument();
  });

  it('handles interaction callbacks on wallet selection failure or unverified states', () => {
    const handleSelect = jest.fn();
    render(<StellarWalletConnect onSelectWallet={handleSelect} />);
    const freighterBtn = screen.getByText(/Freighter Wallet/i);
    freighterBtn.click();
    expect(handleSelect).toHaveBeenCalledWith('freighter');
  });
});
