import { DEFAULT_SETTINGS, type ExtensionSettings, type PriceSighting } from '@/extension/src/types';

/**
 * Exercises the service worker's stateful paths (upload, offline queue,
 * notification) and the settings storage helpers against an in-memory
 * `chrome.*` double.
 */

interface ChromeMock {
  storage: {
    sync: { get: jest.Mock; set: jest.Mock };
    local: { get: jest.Mock; set: jest.Mock };
  };
  notifications: { create: jest.Mock };
  action: { setBadgeText: jest.Mock; setBadgeBackgroundColor: jest.Mock };
  runtime: {
    getURL: jest.Mock;
    onMessage: { addListener: jest.Mock };
    onInstalled: { addListener: jest.Mock };
  };
  alarms: { create: jest.Mock; onAlarm: { addListener: jest.Mock } };
}

function makeChromeMock(): { mock: ChromeMock; syncStore: Record<string, unknown>; localStore: Record<string, unknown> } {
  const syncStore: Record<string, unknown> = {};
  const localStore: Record<string, unknown> = {};

  const area = (store: Record<string, unknown>) => ({
    get: jest.fn((key: string) => Promise.resolve({ [key]: store[key] })),
    set: jest.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
  });

  const mock: ChromeMock = {
    storage: { sync: area(syncStore), local: area(localStore) },
    notifications: { create: jest.fn(() => Promise.resolve('id')) },
    action: {
      setBadgeText: jest.fn(() => Promise.resolve()),
      setBadgeBackgroundColor: jest.fn(() => Promise.resolve()),
    },
    runtime: {
      getURL: jest.fn((path: string) => `chrome-extension://abc/${path}`),
      onMessage: { addListener: jest.fn() },
      onInstalled: { addListener: jest.fn() },
    },
    alarms: { create: jest.fn(), onAlarm: { addListener: jest.fn() } },
  };

  return { mock, syncStore, localStore };
}

const itinerary = {
  origin: 'JFK',
  destination: 'LAX',
  departureDate: '2026-08-01',
  returnDate: null,
  cabinClass: 'economy' as const,
  passengers: 1,
  source: 'www.kayak.com',
  sourceUrl: 'https://www.kayak.com/flights/JFK-LAX/2026-08-01',
};

const sighting: PriceSighting = {
  amountCents: 41230,
  currency: 'USD',
  source: 'www.kayak.com',
  sourceUrl: itinerary.sourceUrl,
  carrierCode: null,
  observedAt: '2026-07-28T12:00:00.000Z',
};

const tracker = {
  id: 'tracker-1',
  origin: 'JFK',
  destination: 'LAX',
  departureDate: '2026-08-01',
  returnDate: null,
  cabinClass: 'economy',
  passengers: 1,
  targetPriceCents: null,
  currency: 'USD',
  status: 'active',
  lastPriceCents: 50000,
  lowestPriceCents: 45000,
};

const STORAGE_KEY = 'traqora:settings';
const QUEUE_KEY = 'traqora:pendingSightings';

describe('service worker', () => {
  let chromeMock: ChromeMock;
  let syncStore: Record<string, unknown>;
  let localStore: Record<string, unknown>;
  let fetchMock: jest.Mock;

  const storedSettings = (overrides: Partial<ExtensionSettings> = {}) => ({
    ...DEFAULT_SETTINGS,
    authToken: 'token-123',
    apiBaseUrl: 'https://api.traqora.io',
    ...overrides,
  });

  /** Queues fetch responses in call order. */
  function respondWith(...responses: Array<{ ok?: boolean; status?: number; body?: unknown }>): void {
    fetchMock = jest.fn(() => {
      const next = responses.shift() ?? { ok: true, body: { success: true, data: null } };
      return Promise.resolve({
        ok: next.ok ?? true,
        status: next.status ?? 200,
        json: () => Promise.resolve(next.body ?? { success: true, data: null }),
      });
    });
    (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;
  }

  beforeEach(() => {
    jest.resetModules();
    const created = makeChromeMock();
    chromeMock = created.mock;
    syncStore = created.syncStore;
    localStore = created.localStore;
    (globalThis as unknown as { chrome: unknown }).chrome = chromeMock;
  });

  afterEach(() => {
    delete (globalThis as unknown as { chrome?: unknown }).chrome;
    delete (globalThis as unknown as { fetch?: unknown }).fetch;
  });

  describe('settings storage', () => {
    it('round-trips settings through chrome.storage.sync', async () => {
      const { loadSettings, saveSettings } = await import('@/extension/src/settings');

      await saveSettings(storedSettings({ minDropPercent: 10 }));

      expect(syncStore[STORAGE_KEY]).toMatchObject({ minDropPercent: 10 });
      expect(await loadSettings()).toMatchObject({
        authToken: 'token-123',
        minDropPercent: 10,
      });
    });

    it('normalizes on the way in, so bad values never reach storage', async () => {
      const { saveSettings } = await import('@/extension/src/settings');

      const stored = await saveSettings({
        ...storedSettings(),
        minDropPercent: 900,
      });

      expect(stored.minDropPercent).toBe(DEFAULT_SETTINGS.minDropPercent);
      expect(syncStore[STORAGE_KEY]).toMatchObject({
        minDropPercent: DEFAULT_SETTINGS.minDropPercent,
      });
    });

    it('returns defaults when nothing has been stored yet', async () => {
      const { loadSettings } = await import('@/extension/src/settings');
      expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe('registration', () => {
    it('wires up message, install, and alarm listeners on load', async () => {
      await import('@/extension/src/background');

      expect(chromeMock.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(chromeMock.runtime.onInstalled.addListener).toHaveBeenCalled();
      expect(chromeMock.alarms.onAlarm.addListener).toHaveBeenCalled();
    });

    it('schedules the flush alarm on install', async () => {
      await import('@/extension/src/background');

      const onInstalled = chromeMock.runtime.onInstalled.addListener.mock.calls[0][0] as () => void;
      onInstalled();

      expect(chromeMock.alarms.create).toHaveBeenCalledWith(
        'traqora:flush',
        expect.objectContaining({ periodInMinutes: 15 }),
      );
    });
  });

  describe('PRICES_FOUND handling', () => {
    /** Drives the registered onMessage listener and waits for it to settle. */
    async function dispatchPricesFound(): Promise<void> {
      await import('@/extension/src/background');
      const listener = chromeMock.runtime.onMessage.addListener.mock.calls[0][0] as (
        message: unknown,
        sender: unknown,
        sendResponse: (response?: unknown) => void,
      ) => boolean;

      await new Promise<void>((resolve) => {
        listener(
          { type: 'PRICES_FOUND', payload: { itinerary, sightings: [sighting] } },
          {},
          () => resolve(),
        );
      });
    }

    it('uploads the sighting for a matching tracker', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      respondWith(
        { body: { success: true, data: [tracker] } },
        { body: { success: true, data: {} } },
      );

      await dispatchPricesFound();

      const observationCall = fetchMock.mock.calls.find(([url]) =>
        String(url).endsWith('/observations'),
      );
      expect(observationCall).toBeDefined();
      expect(JSON.parse((observationCall![1] as { body: string }).body)).toMatchObject({
        priceCents: 41230,
      });
    });

    it('notifies when the drop clears the user threshold', async () => {
      syncStore[STORAGE_KEY] = storedSettings({ minDropPercent: 5 });
      respondWith(
        { body: { success: true, data: [tracker] } },
        { body: { success: true, data: {} } },
      );

      await dispatchPricesFound();

      // 500.00 → 412.30 is a 17.5% drop.
      expect(chromeMock.notifications.create).toHaveBeenCalledWith(
        expect.stringContaining('drop:JFKLAX'),
        expect.objectContaining({ title: 'Flight price drop' }),
      );
    });

    it('stays silent when notifications are disabled', async () => {
      syncStore[STORAGE_KEY] = storedSettings({ notificationsEnabled: false });
      respondWith(
        { body: { success: true, data: [tracker] } },
        { body: { success: true, data: {} } },
      );

      await dispatchPricesFound();

      expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    });

    it('stays silent when the drop is under the threshold', async () => {
      syncStore[STORAGE_KEY] = storedSettings({ minDropPercent: 50 });
      respondWith(
        { body: { success: true, data: [tracker] } },
        { body: { success: true, data: {} } },
      );

      await dispatchPricesFound();

      expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    });

    it('ignores routes the user is not tracking', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      respondWith({ body: { success: true, data: [{ ...tracker, destination: 'SFO' }] } });

      await dispatchPricesFound();

      expect(fetchMock).toHaveBeenCalledTimes(1); // listTrackers only
      expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    });

    it('does nothing without a stored token', async () => {
      syncStore[STORAGE_KEY] = storedSettings({ authToken: '' });
      respondWith({ body: { success: true, data: [tracker] } });

      await dispatchPricesFound();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('queues the sighting when the upload fails', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      respondWith(
        { body: { success: true, data: [tracker] } },
        { ok: false, status: 503, body: { error: { message: 'unavailable' } } },
      );

      await dispatchPricesFound();

      expect(localStore[QUEUE_KEY]).toEqual([
        { trackedFlightId: 'tracker-1', sighting },
      ]);
      expect(chromeMock.notifications.create).not.toHaveBeenCalled();
    });

    it('badges the action when the price ties the all-time low', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      respondWith(
        { body: { success: true, data: [{ ...tracker, lowestPriceCents: 45000 }] } },
        { body: { success: true, data: {} } },
      );

      await dispatchPricesFound();

      expect(chromeMock.action.setBadgeText).toHaveBeenCalledWith({ text: 'LOW' });
    });
  });

  describe('flushQueue', () => {
    it('is a no-op with an empty queue', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      respondWith();
      const { flushQueue } = await import('@/extension/src/background');

      expect(await flushQueue()).toEqual({ flushed: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uploads queued sightings and clears the queue', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      localStore[QUEUE_KEY] = [
        { trackedFlightId: 'tracker-1', sighting },
        { trackedFlightId: 'tracker-2', sighting },
      ];
      respondWith({ body: { success: true, data: { recorded: 2, notified: 0 } } });

      const { flushQueue } = await import('@/extension/src/background');

      expect(await flushQueue()).toEqual({ flushed: 2 });
      expect(localStore[QUEUE_KEY]).toEqual([]);
    });

    it('keeps the queue intact when the flush fails', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      localStore[QUEUE_KEY] = [{ trackedFlightId: 'tracker-1', sighting }];
      respondWith({ ok: false, status: 500, body: {} });

      const { flushQueue } = await import('@/extension/src/background');

      expect(await flushQueue()).toEqual({ flushed: 0 });
      expect(localStore[QUEUE_KEY]).toHaveLength(1);
    });

    it('does not flush without a token', async () => {
      syncStore[STORAGE_KEY] = storedSettings({ authToken: '' });
      localStore[QUEUE_KEY] = [{ trackedFlightId: 'tracker-1', sighting }];
      respondWith();

      const { flushQueue } = await import('@/extension/src/background');

      expect(await flushQueue()).toEqual({ flushed: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('runs when the flush alarm fires', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      localStore[QUEUE_KEY] = [{ trackedFlightId: 'tracker-1', sighting }];
      respondWith({ body: { success: true, data: { recorded: 1, notified: 0 } } });

      await import('@/extension/src/background');
      const onAlarm = chromeMock.alarms.onAlarm.addListener.mock.calls[0][0] as (alarm: {
        name: string;
      }) => void;

      onAlarm({ name: 'traqora:flush' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchMock).toHaveBeenCalled();
    });

    it('ignores unrelated alarms', async () => {
      syncStore[STORAGE_KEY] = storedSettings();
      respondWith();

      await import('@/extension/src/background');
      const onAlarm = chromeMock.alarms.onAlarm.addListener.mock.calls[0][0] as (alarm: {
        name: string;
      }) => void;

      onAlarm({ name: 'something-else' });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
