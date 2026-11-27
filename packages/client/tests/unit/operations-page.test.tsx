import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OperationsPage from '../../app/admin/operations/page';

jest.mock('../../lib/api', () => ({
  API_BASE_URL: 'http://localhost:3001',
  getAuthHeader: () => ({ Authorization: 'Bearer admin-token' }),
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const bookingRow = {
  bookingId: 'booking-1',
  bookingReference: 'TQ-ABC123',
  bookingState: 'confirmed',
  supplierState: 'DELAYED',
  paymentReference: 'pi_123',
  contractState: 'refunded',
  reconciliationStatus: 'needs_review',
  reconciliationDetail: 'Ledger mismatch',
  mismatches: [
    {
      type: 'contract_backend_mismatch',
      severity: 'high',
      detail: 'Contract expects refunded but backend is confirmed',
    },
  ],
  flightNumber: 'TQ204',
  departureTime: '2026-12-01T10:00:00.000Z',
  amountCents: 42000,
  updatedAt: '2026-11-19T09:00:00.000Z',
};

const summary = {
  scannedBookings: 1,
  mismatchedBookings: 1,
  mismatchCount: 1,
  byType: { contract_backend_mismatch: 1 },
  bySeverity: { high: 1, medium: 0, low: 0 },
};

describe('OperationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows booking, supplier, payment and reconciliation state for operators', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, data: [bookingRow], summary })
    );
    global.fetch = fetchMock as jest.Mock;

    render(<OperationsPage />);

    expect(screen.getByRole('heading', { name: /booking operations/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('TQ204')).toBeInTheDocument());
    expect(screen.getByText('TQ-ABC123')).toBeInTheDocument();
    expect(screen.getByText('delayed')).toBeInTheDocument();
    expect(screen.getByText('pi_123')).toBeInTheDocument();
    expect(screen.getByText('refunded')).toBeInTheDocument();
    expect(screen.getByText('needs review')).toBeInTheDocument();
    expect(screen.getByText('Ledger mismatch')).toBeInTheDocument();
    expect(screen.getByText('contract backend mismatch')).toBeInTheDocument();
    expect(screen.getByText(/contract expects refunded but backend is confirmed/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /reconciliation summary/i })).toBeInTheDocument();
    expect(screen.getByText(/counts cover the current page/i)).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/admin/operations/bookings',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      })
    );
  });

  it('shows Unavailable instead of fabricating missing supplier or payment state', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            ...bookingRow,
            supplierState: 'unavailable',
            contractState: 'unavailable',
            flightNumber: 'unavailable',
            paymentReference: null,
            reconciliationStatus: 'not_attempted',
            reconciliationDetail: null,
            mismatches: [],
          },
        ],
      })
    ) as jest.Mock;

    render(<OperationsPage />);

    await waitFor(() => expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(3));
  });

  it('shows a permission message when the operator is forbidden', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 403)) as jest.Mock;

    render(<OperationsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/do not have permission/i);
  });

  it('offers a retry when loading fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({}, 500));
    global.fetch = fetchMock as jest.Mock;

    render(<OperationsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/unable to load operations data/i);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('refetches with the selected status filter', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse({ success: true, data: [] })
    );
    global.fetch = fetchMock as jest.Mock;

    render(<OperationsPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText(/booking state/i), { target: { value: 'confirmed' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        'http://localhost:3001/api/v1/admin/operations/bookings?status=confirmed',
        expect.anything()
      )
    );
  });
});
