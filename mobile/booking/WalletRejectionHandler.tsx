import React from 'react';

interface WalletRejectionHandlerProps {
  onRetry: () => void;
  onCancel: () => void;
  errorMessage?: string;
}

export default function WalletRejectionHandler({
  onRetry,
  onCancel,
  errorMessage = 'Wallet signature or payment was rejected. Your booking remains recoverable.',
}: WalletRejectionHandlerProps) {
  return (
    <div className="wallet-rejection-container">
      <div className="card">
        <h2 className="section-title">Payment Declined</h2>
        <p className="error-message">{errorMessage}</p>
        <p className="recovery-note">
          No funds were transferred. You can retry the payment or return to your dashboard.
        </p>
        <div className="button-group">
          <button className="button retry-button" onClick={onRetry}>
            Retry Payment
          </button>
          <button className="button cancel-button" onClick={onCancel}>
            Cancel / Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
