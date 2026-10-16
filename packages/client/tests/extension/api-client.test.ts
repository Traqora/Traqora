import { TrackingApiClient } from '@/extension/src/api-client';
import { DEFAULT_SETTINGS, type DetectedItinerary, type PriceSighting } from '@/extension/src/types';

const settings = {
  ...DEFAULT_SETTINGS,
  apiBaseUrl: 'https://api.traqora.io/',
  authToken: 'token-123',
};

const itinerary: DetectedItinerary = {
  origin: 'JFK',
  destination: 'LAX',
  departureDate: '2026-08-01',
  returnDate: '2026-08-10',
  cabinClass: 'business',
  passengers: 2,
  source: 'www.kayak.com',
  sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10',
};

const sighting: PriceSighting = {
  amountCents: 41230,
  currency: 'USD',
  source: 'www.kayak.com',
  sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01',
  carrierCode: 'BA',
  observedAt: '2026-07-28T12:00:00.000Z',
};

function mockFetch(response: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  reject?: Error;
}): jest.Mock {
  const fn = jest.fn(() => {
    if (response.reject) return Promise.reject(response.reject);
    return Promise.resolve({
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: () => Promise.resolve(response.body ?? { success: true, data: null }),
    });
  });
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
  return fn as unknown as jest.Mock;
}

describe('TrackingApiClient', () => {
  afterEach(() => {
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
  });

  it('sends the bearer token and strips a trailing slash from the base URL', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: [] } });
    const client = new TrackingApiClient(settings);

    await client.listTrackers();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.traqora.io/api/v1/tracking/trackers',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('refuses to call the API without a token', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: [] } });
    const client = new TrackingApiClient({ ...settings, authToken: '' });

    const result = await client.listTrackers();

    expect(result).toEqual({ ok: false, status: 401, data: null, error: 'Not signed in' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('unwraps the data envelope on success', async () => {
    mockFetch({ body: { success: true, data: [{ id: 'tracker-1' }] } });
    const client = new TrackingApiClient(settings);

    const result = await client.listTrackers();

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ id: 'tracker-1' }]);
    expect(result.error).toBeNull();
  });

  it('surfaces the API error message on a failure response', async () => {
    mockFetch({
      ok: false,
      status: 409,
      body: { error: { message: 'An active tracker already exists for this route' } },
    });
    const client = new TrackingApiClient(settings);

    const result = await client.createTracker(itinerary, null, 'USD');

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      data: null,
      error: 'An active tracker already exists for this route',
    });
  });

  it('falls back to a generic message when the error body is unparseable', async () => {
    const fn = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      }),
    );
    (globalThis as unknown as { fetch: unknown }).fetch = fn;

    const result = await new TrackingApiClient(settings).listTrackers();

    expect(result.error).toBe('Request failed (500)');
  });

  it('returns a network error instead of throwing', async () => {
    mockFetch({ reject: new Error('Failed to fetch') });

    const result = await new TrackingApiClient(settings).listTrackers();

    expect(result).toMatchObject({ ok: false, status: 0, error: 'Failed to fetch' });
  });

  it('maps an itinerary onto the create-tracker payload', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: { id: 'tracker-1' } } });

    await new TrackingApiClient(settings).createTracker(itinerary, 40000, 'EUR');

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      origin: 'JFK',
      destination: 'LAX',
      departureDate: '2026-08-01',
      returnDate: '2026-08-10',
      cabinClass: 'business',
      passengers: 2,
      targetPriceCents: 40000,
      currency: 'EUR',
    });
  });

  it('maps a sighting onto the observation payload', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: {} } });

    await new TrackingApiClient(settings).reportSighting('tracker-1', sighting);

    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe(
      'https://api.traqora.io/api/v1/tracking/trackers/tracker-1/observations',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      priceCents: 41230,
      currency: 'USD',
      source: 'www.kayak.com',
      sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01',
      carrierCode: 'BA',
    });
  });

  it('batches queued sightings into one request', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: { recorded: 2, notified: 1 } } });

    await new TrackingApiClient(settings).reportSightings([
      { trackedFlightId: 'tracker-1', sighting },
      { trackedFlightId: 'tracker-2', sighting },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe('https://api.traqora.io/api/v1/tracking/observations');
    expect(JSON.parse(init.body).observations).toHaveLength(2);
  });

  it('builds the history and stats URLs', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: [] } });
    const client = new TrackingApiClient(settings);

    await client.getHistory('tracker-1', 7);
    await client.getStats('tracker-1');
    await client.deleteTracker('tracker-1');

    const urls = fetchMock.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      'https://api.traqora.io/api/v1/tracking/trackers/tracker-1/history?days=7',
      'https://api.traqora.io/api/v1/tracking/trackers/tracker-1/stats',
      'https://api.traqora.io/api/v1/tracking/trackers/tracker-1',
    ]);
    expect((fetchMock.mock.calls[2][1] as { method: string }).method).toBe('DELETE');
  });

  it('picks up a token supplied after construction', async () => {
    const fetchMock = mockFetch({ body: { success: true, data: [] } });
    const client = new TrackingApiClient({ ...settings, authToken: '' });

    expect((await client.listTrackers()).ok).toBe(false);

    client.updateSettings(settings);
    expect((await client.listTrackers()).ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
