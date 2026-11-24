import { apiClient } from '../../lib/api';

const data = {
  data: [],
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
};

describe('apiClient audit methods', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
  });

  it('builds the audit query without empty values and sends the auth header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => data });
    global.fetch = fetchMock as jest.Mock;
    window.localStorage.setItem(
      'traqora-auth',
      JSON.stringify({ state: { accessToken: 'token-1' } })
    );

    const result = await apiClient.getAuditLogs({ resourceId: 'TQ-ABC123', action: '' });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/audit-logs?resourceId=TQ-ABC123'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      })
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain('action=');
  });

  it('returns a failure result when the export request fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as jest.Mock;

    const result = await apiClient.exportAuditLogs({ from: '2026-11-01T00:00:00.000Z' });

    expect(result.success).toBe(false);
  });

  it('returns the CSV body on a successful export', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => 'id,action\nlog-1,support_booking_access',
    }) as jest.Mock;

    const result = await apiClient.exportAuditLogs();

    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toContain('support_booking_access');
  });
});
