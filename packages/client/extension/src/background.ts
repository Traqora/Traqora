import { TrackingApiClient, findMatchingTracker } from './api-client';
import { loadSettings } from './settings';
import type {
  DetectedItinerary,
  ExtensionMessage,
  PriceSighting,
  TrackedFlight,
} from './types';

/**
 * MV3 service worker: owns network access, the offline queue, and drop
 * notifications. Content scripts stay side-effect free and just report what
 * they see.
 */

const QUEUE_KEY = 'traqora:pendingSightings';
const LAST_SEEN_KEY = 'traqora:lastSeenPrices';
const FLUSH_ALARM = 'traqora:flush';

interface QueuedSighting {
  trackedFlightId: string;
  sighting: PriceSighting;
}

/**
 * Decides whether a sighting is worth alerting on locally.
 *
 * The backend applies the authoritative drop rules and its own cooldown; this
 * is the client-side filter for the user's `minDropPercent` preference, so a
 * user who raised the threshold does not see toasts the server still sends.
 */
export function shouldNotifyLocally(
  newCents: number,
  previousCents: number | null,
  minDropPercent: number,
): boolean {
  if (previousCents === null || previousCents <= 0) return false;
  if (newCents >= previousCents) return false;
  const dropPercent = ((previousCents - newCents) / previousCents) * 100;
  return dropPercent >= minDropPercent;
}

export function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

async function readQueue(): Promise<QueuedSighting[]> {
  const stored = await chrome.storage.local.get(QUEUE_KEY);
  const value = stored?.[QUEUE_KEY];
  return Array.isArray(value) ? (value as QueuedSighting[]) : [];
}

async function writeQueue(queue: QueuedSighting[]): Promise<void> {
  // Cap the backlog so a long offline stretch cannot exhaust storage.
  await chrome.storage.local.set({ [QUEUE_KEY]: queue.slice(-100) });
}

async function readLastSeen(): Promise<Record<string, number>> {
  const stored = await chrome.storage.local.get(LAST_SEEN_KEY);
  const value = stored?.[LAST_SEEN_KEY];
  return value && typeof value === 'object' ? (value as Record<string, number>) : {};
}

async function rememberLastSeen(trackerId: string, cents: number): Promise<void> {
  const lastSeen = await readLastSeen();
  lastSeen[trackerId] = cents;
  await chrome.storage.local.set({ [LAST_SEEN_KEY]: lastSeen });
}

async function notifyDrop(
  itinerary: DetectedItinerary,
  sighting: PriceSighting,
  previousCents: number,
): Promise<void> {
  await chrome.notifications.create(`drop:${itinerary.origin}${itinerary.destination}:${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
    title: 'Flight price drop',
    message:
      `${itinerary.origin} → ${itinerary.destination} on ${itinerary.departureDate} ` +
      `fell to ${formatPrice(sighting.amountCents, sighting.currency)} ` +
      `(was ${formatPrice(previousCents, sighting.currency)}).`,
    priority: 2,
  });
}

async function handlePricesFound(
  itinerary: DetectedItinerary,
  sightings: PriceSighting[],
): Promise<void> {
  const settings = await loadSettings();
  if (!settings.authToken) return;

  const client = new TrackingApiClient(settings);
  const trackersResult = await client.listTrackers();
  if (!trackersResult.ok || !trackersResult.data) return;

  const tracker = findMatchingTracker(trackersResult.data, itinerary);
  if (!tracker) return; // Untracked route — nothing to record.

  const cheapest = sightings.reduce((min, s) =>
    s.amountCents < min.amountCents ? s : min,
  );

  const lastSeen = await readLastSeen();
  const previousCents = lastSeen[tracker.id] ?? tracker.lastPriceCents ?? null;

  const result = await client.reportSighting(tracker.id, cheapest);
  if (!result.ok) {
    const queue = await readQueue();
    queue.push({ trackedFlightId: tracker.id, sighting: cheapest });
    await writeQueue(queue);
    return;
  }

  await rememberLastSeen(tracker.id, cheapest.amountCents);
  await updateBadge(tracker, cheapest);

  if (
    settings.notificationsEnabled &&
    shouldNotifyLocally(cheapest.amountCents, previousCents, settings.minDropPercent)
  ) {
    await notifyDrop(itinerary, cheapest, previousCents as number);
  }
}

async function updateBadge(
  tracker: TrackedFlight,
  sighting: PriceSighting,
): Promise<void> {
  const isLow =
    tracker.lowestPriceCents === null || sighting.amountCents <= tracker.lowestPriceCents;
  await chrome.action.setBadgeBackgroundColor({ color: isLow ? '#16a34a' : '#64748b' });
  await chrome.action.setBadgeText({ text: isLow ? 'LOW' : '' });
}

/** Retries sightings that failed to upload while the browser was offline. */
export async function flushQueue(): Promise<{ flushed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { flushed: 0 };

  const settings = await loadSettings();
  if (!settings.authToken) return { flushed: 0 };

  const client = new TrackingApiClient(settings);
  const result = await client.reportSightings(queue);

  if (!result.ok) return { flushed: 0 };

  await writeQueue([]);
  return { flushed: queue.length };
}

function registerListeners(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const typed = message as ExtensionMessage;

    if (typed?.type === 'PRICES_FOUND') {
      void handlePricesFound(typed.payload.itinerary, typed.payload.sightings).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      return true;
    }

    return false;
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 15 });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FLUSH_ALARM) void flushQueue();
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  registerListeners();
}
