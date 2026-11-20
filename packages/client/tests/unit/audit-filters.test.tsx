import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockGetAuditLogs = jest.fn();
const mockExportAuditLogs = jest.fn();

jest.mock('../../lib/api', () => ({
  apiClient: {
    getAuditLogs: (...args: unknown[]) => mockGetAuditLogs(...args),
    exportAuditLogs: (...args: unknown[]) => mockExportAuditLogs(...args),
  },
}));

jest.mock('../../components/ui/button', () => {
  const React = require('react');
  return {
    Button: ({ children, ...props }: any) => React.createElement('button', props, children),
  };
});
jest.mock('../../components/ui/input', () => {
  const React = require('react');
  return {
    Input: ({ children, ...props }: any) => React.createElement('input', props, children),
  };
});
jest.mock('../../components/ui/label', () => {
  const React = require('react');
  return {
    Label: ({ children, ...props }: any) => React.createElement('label', props, children),
  };
});
jest.mock('../../components/ui/table', () => {
  const React = require('react');
  const element = (tag: string) => ({ children, ...props }: any) => React.createElement(tag, props, children);
  return {
    Table: element('table'),
    TableBody: element('tbody'),
    TableCell: element('td'),
    TableHead: element('th'),
    TableHeader: element('thead'),
    TableRow: element('tr'),
  };
});

import AuditLogsPage from '../../app/admin/audit-logs/page';

const entry = {
  id: 'log-1',
  action: 'support_booking_access',
  actorType: 'admin',
  userId: null,
  adminId: 'admin-1',
  resource: 'bookings',
  resourceId: 'TQ-ABC123',
  details: null,
  metadata: null,
  ipAddress: '127.0.0.1',
  userAgent: null,
  createdAt: '2026-11-19T09:00:00.000Z',
};

const page = {
  data: [entry],
  pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
};

describe('audit log filtering page', () => {
  beforeAll(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: jest.fn(() => 'blob:mock-url'),
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: jest.fn(),
      writable: true,
    });
    jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuditLogs.mockResolvedValue({ success: true, data: page });
    mockExportAuditLogs.mockResolvedValue({ success: true, data: 'id,action\nlog-1,support_booking_access' });
  });

  it('sends time and reference filters to the server', async () => {
    render(<AuditLogsPage />);

    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('support booking access')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01T08:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-19T08:00' } });
    fireEvent.change(screen.getByLabelText('Booking reference'), { target: { value: 'TQ-ABC123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(2));
    expect(mockGetAuditLogs).toHaveBeenLastCalledWith({
      from: new Date('2026-11-01T08:00').toISOString(),
      to: new Date('2026-11-19T08:00').toISOString(),
      resourceId: 'TQ-ABC123',
      resource: undefined,
      action: undefined,
      actorType: undefined,
      page: 1,
      limit: 50,
    });
  });

  it('shows an explicit error with retry when the server rejects the query', async () => {
    mockGetAuditLogs.mockResolvedValueOnce({ success: false, error: { message: 'forbidden' } });

    render(<AuditLogsPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Unable to load audit logs');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(2));
  });

  it('exports the currently filtered events through the api client', async () => {
    render(<AuditLogsPage />);
    await waitFor(() => expect(mockGetAuditLogs).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => expect(mockExportAuditLogs).toHaveBeenCalledTimes(1));
    expect(mockExportAuditLogs).toHaveBeenCalledWith({
      from: undefined,
      to: undefined,
      resourceId: undefined,
      resource: undefined,
      action: undefined,
      actorType: undefined,
      page: 1,
      limit: 50,
    });
  });
});
