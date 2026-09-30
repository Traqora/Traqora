import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CheckInPage from '../../app/checkin/[bookingId]/page';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
    };
  },
}));

describe('CheckInPage Component', () => {
  it('renders loading state initially', async () => {
    global.fetch = jest.fn().mockImplementation(() =>
      Promise.resolve({
        json: () => Promise.resolve({ success: true, data: { isOpen: true } }),
      })
    );

    const params = Promise.resolve({ bookingId: 'booking-123' });
    render(<CheckInPage params={params} />);

    expect(screen.getByText('Flight Check-In')).toBeInTheDocument();
  });
});
