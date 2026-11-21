import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FinalTermsReview } from '../booking/FinalTermsReview';

describe('FinalTermsReview', () => {
  const mockFareTerms = 'Non-refundable fare, changes allowed with fee.';
  const mockCancellationPolicy = 'Free cancellation within 24 hours of booking.';

  it('renders fare terms and cancellation policy correctly', () => {
    const { getByText } = render(
      <FinalTermsReview
        fareTerms={mockFareTerms}
        cancellationPolicy={mockCancellationPolicy}
        onAccept={() => {}}
        onCancel={() => {}}
      />
    );

    expect(getByText(mockFareTerms)).toBeTruthy();
    expect(getByText(mockCancellationPolicy)).toBeTruthy();
  });

  it('triggers onAccept when authorization button is pressed', () => {
    const onAccept = jest.fn();
    const { getByTestId } = render(
      <FinalTermsReview
        fareTerms={mockFareTerms}
        cancellationPolicy={mockCancellationPolicy}
        onAccept={onAccept}
        onCancel={() => {}}
      />
    );

    fireEvent.press(getByTestId('accept-terms-button'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('triggers onCancel when cancel button is pressed', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <FinalTermsReview
        fareTerms={mockFareTerms}
        cancellationPolicy={mockCancellationPolicy}
        onAccept={() => {}}
        onCancel={onCancel}
      />
    );

    fireEvent.press(getByTestId('cancel-terms-button'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
