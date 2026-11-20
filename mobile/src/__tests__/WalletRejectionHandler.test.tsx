import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import WalletRejectionHandler from '../../booking/WalletRejectionHandler';

describe('WalletRejectionHandler', () => {
  it('renders rejection message and action buttons correctly', () => {
    const handleRetry = jest.fn();
    const handleCancel = jest.fn();

    render(
      <WalletRejectionHandler
        onRetry={handleRetry}
        onCancel={handleCancel}
        errorMessage="User rejected the wallet transaction."
      />
    );

    expect(screen.getByText('Payment Declined')).toBeInTheDocument();
    expect(screen.getByText('User rejected the wallet transaction.')).toBeInTheDocument();
    expect(screen.getByText('No funds were transferred. You can retry the payment or return to your dashboard.')).toBeInTheDocument();

    const retryBtn = screen.getByText('Retry Payment');
    const cancelBtn = screen.getByText('Cancel / Dashboard');

    expect(retryBtn).toBeInTheDocument();
    expect(cancelBtn).toBeInTheDocument();

    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
