import { normalizeSettings } from '@/extension/src/settings';
import { formatPrice, shouldNotifyLocally } from '@/extension/src/background';
import { findMatchingTracker } from '@/extension/src/api-client';
import { DEFAULT_SETTINGS, type DetectedItinerary, type TrackedFlight } from '@/extension/src/types';

describe('normalizeSettings', () => {
  it('returns defaults for empty or missing storage', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid stored values', () => {
    expect(
      normalizeSettings({
        apiBaseUrl: 'https://api.traqora.io',
        authToken: 'token-123',
        notificationsEnabled: false,
        minDropPercent: 12,
        autoDetect: false,
      }),
    ).toEqual({
      apiBaseUrl: 'https://api.traqora.io',
      authToken: 'token-123',
      notificationsEnabled: false,
      minDropPercent: 12,
      autoDetect: false,
    });
  });

  it('repairs values written by an older or broken version', () => {
    const result = normalizeSettings({
      apiBaseUrl: '   ',
      authToken: 42,
      notificationsEnabled: 'yes',
      minDropPercent: 'lots',
      autoDetect: null,
    });

    expect(result).toEqual(DEFAULT_SETTINGS);
  });

  it('rejects an out-of-range drop threshold', () => {
    expect(normalizeSettings({ minDropPercent: -5 }).minDropPercent).toBe(
      DEFAULT_SETTINGS.minDropPercent,
    );
    expect(normalizeSettings({ minDropPercent: 150 }).minDropPercent).toBe(
      DEFAULT_SETTINGS.minDropPercent,
    );
    expect(normalizeSettings({ minDropPercent: 0 }).minDropPercent).toBe(0);
  });

  it('trims the API base URL', () => {
    expect(normalizeSettings({ apiBaseUrl: '  https://api.traqora.io  ' }).apiBaseUrl).toBe(
      'https://api.traqora.io',
    );
  });
});

describe('shouldNotifyLocally', () => {
  it('notifies when the drop meets the threshold', () => {
    expect(shouldNotifyLocally(90_00, 100_00, 5)).toBe(true);
    expect(shouldNotifyLocally(95_00, 100_00, 5)).toBe(true);
  });

  it('stays silent for drops under the threshold', () => {
    expect(shouldNotifyLocally(97_00, 100_00, 5)).toBe(false);
  });

  it('stays silent when the price rose or held', () => {
    expect(shouldNotifyLocally(110_00, 100_00, 5)).toBe(false);
    expect(shouldNotifyLocally(100_00, 100_00, 5)).toBe(false);
  });

  it('stays silent without a baseline', () => {
    expect(shouldNotifyLocally(90_00, null, 5)).toBe(false);
    expect(shouldNotifyLocally(90_00, 0, 5)).toBe(false);
  });

  it('notifies on any drop when the threshold is zero', () => {
    expect(shouldNotifyLocally(99_99, 100_00, 0)).toBe(true);
  });
});

describe('formatPrice', () => {
  it('renders minor units as currency', () => {
    expect(formatPrice(129900, 'USD')).toContain('1,299');
  });

  it('falls back gracefully for an unknown currency code', () => {
    expect(formatPrice(129900, 'XXXXX')).toBe('1299.00 XXXXX');
  });
});

describe('findMatchingTracker', () => {
  const itinerary: DetectedItinerary = {
    origin: 'JFK',
    destination: 'LAX',
    departureDate: '2026-08-01',
    returnDate: '2026-08-10',
    cabinClass: 'economy',
    passengers: 1,
    source: 'www.kayak.com',
    sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01/2026-08-10',
  };

  const tracker: TrackedFlight = {
    id: 'tracker-1',
    origin: 'JFK',
    destination: 'LAX',
    departureDate: '2026-08-01',
    returnDate: '2026-08-10',
    cabinClass: 'economy',
    passengers: 1,
    targetPriceCents: null,
    currency: 'USD',
    status: 'active',
    lastPriceCents: null,
    lowestPriceCents: null,
  };

  it('finds the tracker for a matching route', () => {
    expect(findMatchingTracker([tracker], itinerary)?.id).toBe('tracker-1');
  });

  it('does not match a different date, cabin, or route', () => {
    expect(
      findMatchingTracker([{ ...tracker, departureDate: '2026-08-02' }], itinerary),
    ).toBeNull();
    expect(findMatchingTracker([{ ...tracker, cabinClass: 'business' }], itinerary)).toBeNull();
    expect(findMatchingTracker([{ ...tracker, destination: 'SFO' }], itinerary)).toBeNull();
  });

  it('treats a one-way tracker and a round trip as different', () => {
    expect(findMatchingTracker([{ ...tracker, returnDate: null }], itinerary)).toBeNull();
  });

  it('returns null for an empty tracker list', () => {
    expect(findMatchingTracker([], itinerary)).toBeNull();
  });
});
