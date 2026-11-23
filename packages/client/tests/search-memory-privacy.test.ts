import { apiClient } from '../lib/api';

describe('search memory privacy controls', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('traqora-auth', JSON.stringify({ state: { accessToken: 'test-token' } }));
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('clears all search history via DELETE /search/history', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deletedCount: 4 } }),
    });

    const response = await apiClient.clearSearchHistory();
    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.data.deletedCount).toBe(4);
    }
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/flights/search/history'),
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('clears all saved searches via DELETE /saved-searches', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { deletedCount: 2 } }),
    });

    const response = await apiClient.clearSavedSearches();
    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.data.deletedCount).toBe(2);
    }
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/flights/saved-searches'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('exports the user\'s search data via GET /search/history/export', async () => {
    const exportedAt = '2026-09-01T12:00:00.000Z';
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        exportedAt,
        userId: 'GSEARCHUSER123',
        history: [
          {
            id: 'history-1',
            userId: 'GSEARCHUSER123',
            fromAirport: 'JFK',
            toAirport: 'LAX',
            departureDate: '2026-09-01',
            passengers: 1,
            cabinClass: 'economy',
            createdAt: exportedAt,
          },
        ],
        savedSearches: [],
      }),
    });

    const response = await apiClient.exportSearchData();
    expect(response.success).toBe(true);
    if (response.success) {
      expect(response.data.userId).toBe('GSEARCHUSER123');
      expect(response.data.history).toHaveLength(1);
      expect(response.data.savedSearches).toHaveLength(0);
    }
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/flights/search/history/export'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  it('surfaces an error message when the export request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'boom' } }),
    });

    const response = await apiClient.exportSearchData();
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.message).toBe('boom');
    }
  });

  it('surfaces an error message when clear-history request fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Unauthorized' } }),
    });

    const response = await apiClient.clearSearchHistory();
    expect(response.success).toBe(false);
    if (!response.success) {
      expect(response.error.message).toBe('Unauthorized');
    }
  });
});