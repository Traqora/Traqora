/**
 * Shared types for the Traqora flight price tracking extension.
 *
 * The extension has no bundler step, so these types are consumed directly by
 * the content script, the service worker, the popup, and the options page.
 */

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface ParsedPrice {
  /** Amount in minor units (cents) so it round-trips with the backend. */
  amountCents: number;
  /** ISO 4217 code, upper-cased. */
  currency: string;
}

/** A route + dates the extension recognised on the current page. */
export interface DetectedItinerary {
  origin: string;
  destination: string;
  /** ISO date, YYYY-MM-DD. */
  departureDate: string;
  returnDate: string | null;
  cabinClass: CabinClass;
  passengers: number;
  /** Hostname the itinerary was detected on. */
  source: string;
  sourceUrl: string;
}

export interface PriceSighting extends ParsedPrice {
  source: string;
  sourceUrl: string;
  carrierCode: string | null;
  observedAt: string;
}

export interface TrackedFlight {
  id: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string | null;
  cabinClass: CabinClass;
  passengers: number;
  targetPriceCents: number | null;
  currency: string;
  status: 'active' | 'paused' | 'expired';
  lastPriceCents: number | null;
  lowestPriceCents: number | null;
}

export interface ExtensionSettings {
  apiBaseUrl: string;
  authToken: string;
  /** Master switch for drop notifications. */
  notificationsEnabled: boolean;
  /** Suppress alerts for drops smaller than this percentage. */
  minDropPercent: number;
  /** Detect itineraries automatically as the user browses. */
  autoDetect: boolean;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  apiBaseUrl: 'http://localhost:4000',
  authToken: '',
  notificationsEnabled: true,
  minDropPercent: 5,
  autoDetect: true,
};

/** Messages passed between the content script, popup, and service worker. */
export type ExtensionMessage =
  | { type: 'ITINERARY_DETECTED'; payload: DetectedItinerary }
  | { type: 'PRICES_FOUND'; payload: { itinerary: DetectedItinerary; sightings: PriceSighting[] } }
  | { type: 'GET_PAGE_STATE' }
  | { type: 'TRACK_CURRENT'; payload: { targetPriceCents: number | null } }
  | { type: 'SETTINGS_UPDATED'; payload: ExtensionSettings };

export interface PageState {
  itinerary: DetectedItinerary | null;
  sightings: PriceSighting[];
}
