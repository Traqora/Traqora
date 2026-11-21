import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import OperationsHealthPage from '../../app/admin/operations-health/page';

jest.mock('../../lib/api', () => ({
  API_BASE_URL: 'http://localhost:3001',
  getAuthHeader: () => ({ Authorization: 'Bearer admin-token' }),
}));

const snapshot = {
  generatedAt: '2026-11-19T12:00:00.000Z',
  supplier: {
    lastSuccessfulRequest: '2026-11-19T11:58:00.000Z',
    currentHealth: 'degraded',
    recentFailures: 1,
    recentRequestWindow: 20,
  },
  payment: { currentHealth: 'healthy', circuitState: 'CLOSED' },
  contract: {
    currentHealth: 'unavailable',
    lastReconciledAt: null,
    needsReviewCount: 0,
  },
};

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe('OperationsHealthPage', () => {
  it('shows supplier, payment and contract state with an admin request', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse(snapshot));
    global.fetch = fetchMock as jest.Mock;

    render(<OperationsHealthPage />);

    expect(await screen.findByText('Supplier health')).toBeInTheDocument();
    expect(screen.getByText('Payment health')).toBeInTheDocument();
    expect(screen.getByText('Contract and reconciliation health')).toBeInTheDocument();
    expect(screen.getByText('1 of 20 recent requests')).toBeInTheDocument();
    expect(screen.getAllByTestId('health-state').map((node) => node.getAttribute('data-state')))
      .toEqual(['degraded', 'healthy', 'unavailable']);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/health/operations',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
      })
    );
  });

  it('shows explicit unavailable text when no timestamp exists', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(snapshot)) as jest.Mock;

    render(<OperationsHealthPage />);

    expect(await screen.findAllByText('No recorded value')).toHaveLength(1);
  });

  it('shows a permission message for unauthorized operators', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({}, 403)) as jest.Mock;

    render(<OperationsHealthPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('do not have permission');
  });

  it('offers retry on a failed load', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse({}, 500));
    global.fetch = fetchMock as jest.Mock;

    render(<OperationsHealthPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load operations health');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
