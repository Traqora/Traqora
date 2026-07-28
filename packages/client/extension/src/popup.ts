import { TrackingApiClient, findMatchingTracker } from './api-client';
import { formatPrice } from './background';
import { loadSettings } from './settings';
import { lowestSighting } from './price-extraction';
import type { PageState, TrackedFlight } from './types';

/**
 * Popup UI: shows the itinerary detected on the active tab, lets the user
 * start tracking it with an optional target price, and lists existing
 * trackers with their current and best-ever prices.
 */

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function setStatus(message: string, isError = false): void {
  const status = el('status');
  status.textContent = message;
  status.className = isError ? 'status error' : 'status';
}

async function readPageState(): Promise<PageState | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    return await chrome.tabs.sendMessage<unknown, PageState>(tab.id, {
      type: 'GET_PAGE_STATE',
    });
  } catch {
    // No content script on this tab (e.g. a chrome:// page).
    return null;
  }
}

function renderTrackers(
  trackers: TrackedFlight[],
  onRemove: (id: string) => void,
): void {
  const list = el<HTMLUListElement>('trackers');
  list.innerHTML = '';

  if (trackers.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'muted';
    empty.textContent = 'No routes tracked yet.';
    list.appendChild(empty);
    return;
  }

  for (const tracker of trackers) {
    const item = document.createElement('li');

    const label = document.createElement('div');
    label.innerHTML =
      `<div><strong>${tracker.origin} → ${tracker.destination}</strong></div>` +
      `<div class="muted">${tracker.departureDate}` +
      `${tracker.returnDate ? ` · ${tracker.returnDate}` : ''}</div>`;

    const right = document.createElement('div');
    right.style.textAlign = 'right';
    const current =
      tracker.lastPriceCents === null
        ? '—'
        : formatPrice(tracker.lastPriceCents, tracker.currency);
    const lowest =
      tracker.lowestPriceCents === null
        ? '—'
        : formatPrice(tracker.lowestPriceCents, tracker.currency);
    right.innerHTML = `<div>${current}</div><div class="muted">best ${lowest}</div>`;

    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.textContent = '✕';
    remove.title = 'Stop tracking';
    remove.addEventListener('click', () => onRemove(tracker.id));

    item.append(label, right, remove);
    list.appendChild(item);
  }
}

async function init(): Promise<void> {
  el('open-options').addEventListener('click', (event) => {
    event.preventDefault();
    window.open(chrome.runtime.getURL('options.html'), '_blank');
  });

  const settings = await loadSettings();
  if (!settings.authToken) {
    setStatus('Add your Traqora API token in Settings to start tracking.', true);
    return;
  }

  const client = new TrackingApiClient(settings);
  const state = await readPageState();

  const refresh = async (): Promise<TrackedFlight[]> => {
    const result = await client.listTrackers();
    if (!result.ok || !result.data) {
      setStatus(result.error ?? 'Could not load trackers', true);
      return [];
    }
    renderTrackers(result.data, async (id) => {
      await client.deleteTracker(id);
      await refresh();
    });
    return result.data;
  };

  const trackers = await refresh();
  const section = el('current');

  if (!state?.itinerary) {
    section.innerHTML =
      '<div class="muted">No flight search detected on this page.</div>';
    return;
  }

  const { itinerary } = state;
  const cheapest = lowestSighting(state.sightings);
  const existing = findMatchingTracker(trackers, itinerary);

  section.innerHTML =
    `<div class="route">${itinerary.origin} → ${itinerary.destination}</div>` +
    `<div class="muted">${itinerary.departureDate}` +
    `${itinerary.returnDate ? ` · returns ${itinerary.returnDate}` : ''} · ` +
    `${itinerary.cabinClass.replace('_', ' ')}</div>` +
    `<div class="price">${
      cheapest ? formatPrice(cheapest.amountCents, cheapest.currency) : 'No price found'
    }</div>`;

  if (existing) {
    const note = document.createElement('div');
    note.className = 'muted';
    note.textContent = 'Already tracking this route.';
    section.appendChild(note);
    return;
  }

  const row = document.createElement('div');
  row.className = 'row';

  const target = document.createElement('input');
  target.type = 'number';
  target.min = '1';
  target.placeholder = 'Alert me below (optional)';

  const track = document.createElement('button');
  track.textContent = 'Track this route';
  track.addEventListener('click', async () => {
    track.disabled = true;
    setStatus('Creating tracker…');

    const targetValue = Number(target.value);
    const targetPriceCents =
      Number.isFinite(targetValue) && targetValue > 0
        ? Math.round(targetValue * 100)
        : null;

    const result = await client.createTracker(
      itinerary,
      targetPriceCents,
      cheapest?.currency ?? 'USD',
    );

    if (!result.ok || !result.data) {
      setStatus(result.error ?? 'Could not create tracker', true);
      track.disabled = false;
      return;
    }

    if (cheapest) await client.reportSighting(result.data.id, cheapest);

    setStatus('Tracking started.');
    await refresh();
    row.remove();
  });

  row.append(target, track);
  section.appendChild(row);
}

if (typeof document !== 'undefined') {
  void init().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : 'Unexpected error', true);
  });
}
