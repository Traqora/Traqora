import type {
  DetectedItinerary,
  ExtensionSettings,
  PriceSighting,
  TrackedFlight,
} from './types';

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

/**
 * Thin wrapper over the Traqora tracking API.
 *
 * Every call resolves to an `ApiResult` rather than throwing — the service
 * worker has no error boundary, and a rejected promise there is silently
 * swallowed by the browser.
 */
export class TrackingApiClient {
  constructor(private settings: ExtensionSettings) {}

  updateSettings(settings: ExtensionSettings): void {
    this.settings = settings;
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<ApiResult<T>> {
    const { apiBaseUrl, authToken } = this.settings;

    if (!authToken) {
      return { ok: false, status: 401, data: null, error: 'Not signed in' };
    }

    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; data?: T; error?: { message?: string } }
        | null;

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          data: null,
          error: payload?.error?.message ?? `Request failed (${response.status})`,
        };
      }

      return {
        ok: true,
        status: response.status,
        data: (payload?.data ?? null) as T | null,
        error: null,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  listTrackers(): Promise<ApiResult<TrackedFlight[]>> {
    return this.request<TrackedFlight[]>('/api/v1/tracking/trackers');
  }

  createTracker(
    itinerary: DetectedItinerary,
    targetPriceCents: number | null,
    currency: string,
  ): Promise<ApiResult<TrackedFlight>> {
    return this.request<TrackedFlight>('/api/v1/tracking/trackers', {
      method: 'POST',
      body: {
        origin: itinerary.origin,
        destination: itinerary.destination,
        departureDate: itinerary.departureDate,
        returnDate: itinerary.returnDate,
        cabinClass: itinerary.cabinClass,
        passengers: itinerary.passengers,
        targetPriceCents,
        currency,
      },
    });
  }

  deleteTracker(trackerId: string): Promise<ApiResult<null>> {
    return this.request<null>(`/api/v1/tracking/trackers/${trackerId}`, {
      method: 'DELETE',
    });
  }

  getHistory(trackerId: string, days = 30): Promise<ApiResult<unknown[]>> {
    return this.request<unknown[]>(
      `/api/v1/tracking/trackers/${trackerId}/history?days=${days}`,
    );
  }

  getStats(trackerId: string): Promise<ApiResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>(
      `/api/v1/tracking/trackers/${trackerId}/stats`,
    );
  }

  reportSighting(
    trackerId: string,
    sighting: PriceSighting,
  ): Promise<ApiResult<Record<string, unknown>>> {
    return this.request<Record<string, unknown>>(
      `/api/v1/tracking/trackers/${trackerId}/observations`,
      {
        method: 'POST',
        body: {
          priceCents: sighting.amountCents,
          currency: sighting.currency,
          source: sighting.source,
          sourceUrl: sighting.sourceUrl,
          carrierCode: sighting.carrierCode,
        },
      },
    );
  }

  /** Flushes a batch of queued sightings collected while offline. */
  reportSightings(
    entries: Array<{ trackedFlightId: string; sighting: PriceSighting }>,
  ): Promise<ApiResult<{ recorded: number; notified: number }>> {
    return this.request<{ recorded: number; notified: number }>(
      '/api/v1/tracking/observations',
      {
        method: 'POST',
        body: {
          observations: entries.map(({ trackedFlightId, sighting }) => ({
            trackedFlightId,
            priceCents: sighting.amountCents,
            currency: sighting.currency,
            source: sighting.source,
            sourceUrl: sighting.sourceUrl,
            carrierCode: sighting.carrierCode,
          })),
        },
      },
    );
  }
}

/** Matches a detected itinerary against the user's existing trackers. */
export function findMatchingTracker(
  trackers: TrackedFlight[],
  itinerary: DetectedItinerary,
): TrackedFlight | null {
  return (
    trackers.find(
      (tracker) =>
        tracker.origin === itinerary.origin &&
        tracker.destination === itinerary.destination &&
        tracker.departureDate === itinerary.departureDate &&
        (tracker.returnDate ?? null) === itinerary.returnDate &&
        tracker.cabinClass === itinerary.cabinClass,
    ) ?? null
  );
}
