import { detectItinerary, isSameItinerary } from './flight-detection';
import { extractPricesFromDocument, lowestSighting } from './price-extraction';
import type { DetectedItinerary, ExtensionMessage, PageState, PriceSighting } from './types';

/**
 * Content script: watches a travel site's results page, recognises the
 * itinerary being shown, and reports the cheapest visible fare.
 *
 * Results pages re-render prices asynchronously, so a single pass on load
 * misses most fares. A debounced MutationObserver re-scans as the page
 * settles, and only a changed cheapest price is forwarded.
 */

const RESCAN_DEBOUNCE_MS = 1500;
const MAX_SCANS_PER_PAGE = 20;

let currentItinerary: DetectedItinerary | null = null;
let lastReportedCents: number | null = null;
let scanCount = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scan(): void {
  if (scanCount >= MAX_SCANS_PER_PAGE) return;
  scanCount += 1;

  const itinerary = detectItinerary(window.location.href);
  if (!itinerary) return;

  // A client-side route change to a different search resets the baseline.
  if (!isSameItinerary(itinerary, currentItinerary)) {
    currentItinerary = itinerary;
    lastReportedCents = null;
    void postMessage({ type: 'ITINERARY_DETECTED', payload: itinerary });
  }

  const sightings = extractPricesFromDocument(document, {
    source: itinerary.source,
    sourceUrl: itinerary.sourceUrl,
  });

  const cheapest = lowestSighting(sightings);
  if (!cheapest) return;
  if (lastReportedCents !== null && cheapest.amountCents >= lastReportedCents) return;

  lastReportedCents = cheapest.amountCents;
  void postMessage({
    type: 'PRICES_FOUND',
    payload: { itinerary, sightings: [cheapest] },
  });
}

function scheduleScan(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(scan, RESCAN_DEBOUNCE_MS);
}

async function postMessage(message: ExtensionMessage): Promise<void> {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
    // The service worker may be asleep or the extension reloading; the next
    // scan re-sends, so dropping this message is safe.
  }
}

function currentPageState(): PageState {
  const sightings: PriceSighting[] = currentItinerary
    ? extractPricesFromDocument(document, {
        source: currentItinerary.source,
        sourceUrl: currentItinerary.sourceUrl,
      })
    : [];
  return { itinerary: currentItinerary, sightings };
}

export function start(): void {
  scan();

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if ((message as ExtensionMessage)?.type === 'GET_PAGE_STATE') {
      sendResponse(currentPageState());
      return true;
    }
    return false;
  });
}

// Guarded so the module can be imported by tests without a live DOM.
if (typeof document !== 'undefined' && typeof chrome !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
