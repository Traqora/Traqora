import type { CabinClass, DetectedItinerary } from './types';

const IATA = /^[A-Z]{3}$/;

const CABIN_ALIASES: Record<string, CabinClass> = {
  economy: 'economy',
  coach: 'economy',
  e: 'economy',
  premium: 'premium_economy',
  premium_economy: 'premium_economy',
  premiumeconomy: 'premium_economy',
  p: 'premium_economy',
  business: 'business',
  b: 'business',
  first: 'first',
  f: 'first',
};

export function normalizeCabinClass(raw: string | null | undefined): CabinClass {
  if (!raw) return 'economy';
  return CABIN_ALIASES[raw.trim().toLowerCase().replace(/[\s-]/g, '_')] ?? 'economy';
}

/**
 * Expands a 6-digit `YYMMDD` (Skyscanner's URL format) to an ISO date.
 * Two-digit years are assumed to be 2000-2099, which holds for bookable
 * travel dates.
 */
export function expandShortDate(value: string): string | null {
  if (!/^\d{6}$/.test(value)) return null;
  const year = 2000 + Number(value.slice(0, 2));
  const month = value.slice(2, 4);
  const day = value.slice(4, 6);
  const iso = `${year}-${month}-${day}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

interface PartialItinerary {
  origin?: string;
  destination?: string;
  departureDate?: string;
  returnDate?: string | null;
  cabinClass?: CabinClass;
  passengers?: number;
}

type SiteMatcher = (url: URL) => PartialItinerary | null;

/** Kayak: /flights/JFK-LAX/2026-08-01/2026-08-10 */
const matchKayak: SiteMatcher = (url) => {
  if (!/(^|\.)kayak\./i.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const flightsIndex = parts.indexOf('flights');
  if (flightsIndex === -1) return null;

  const route = parts[flightsIndex + 1] ?? '';
  const [origin, destination] = route.toUpperCase().split('-');
  if (!IATA.test(origin ?? '') || !IATA.test(destination ?? '')) return null;

  const dates = parts
    .slice(flightsIndex + 2)
    .filter((part) => isValidIsoDate(part));

  return {
    origin,
    destination,
    departureDate: dates[0],
    returnDate: dates[1] ?? null,
    cabinClass: normalizeCabinClass(url.searchParams.get('cabin')),
  };
};

/** Skyscanner: /transport/flights/jfk/lax/260801/260810/ */
const matchSkyscanner: SiteMatcher = (url) => {
  if (!/(^|\.)skyscanner\./i.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const flightsIndex = parts.indexOf('flights');
  if (flightsIndex === -1) return null;

  const origin = (parts[flightsIndex + 1] ?? '').toUpperCase();
  const destination = (parts[flightsIndex + 2] ?? '').toUpperCase();
  if (!IATA.test(origin) || !IATA.test(destination)) return null;

  return {
    origin,
    destination,
    departureDate: expandShortDate(parts[flightsIndex + 3] ?? '') ?? undefined,
    returnDate: expandShortDate(parts[flightsIndex + 4] ?? ''),
    cabinClass: normalizeCabinClass(url.searchParams.get('cabinclass')),
    passengers: toPassengerCount(url.searchParams.get('adults')),
  };
};

/** Expedia: /Flights-Search?leg1=from:JFK,to:LAX,departure:2026-08-01TANYT */
const matchExpedia: SiteMatcher = (url) => {
  if (!/(^|\.)expedia\./i.test(url.hostname)) return null;

  const legs = [url.searchParams.get('leg1'), url.searchParams.get('leg2')];
  const parseLeg = (leg: string | null) => {
    if (!leg) return null;
    const from = leg.match(/from:([A-Za-z]{3})/);
    const to = leg.match(/to:([A-Za-z]{3})/);
    const departure = leg.match(/departure:(\d{4}-\d{2}-\d{2})/);
    return {
      origin: from?.[1]?.toUpperCase(),
      destination: to?.[1]?.toUpperCase(),
      date: departure?.[1],
    };
  };

  const outbound = parseLeg(legs[0]);
  if (!outbound?.origin || !outbound.destination) return null;
  const inbound = parseLeg(legs[1]);

  return {
    origin: outbound.origin,
    destination: outbound.destination,
    departureDate: outbound.date,
    returnDate: inbound?.date ?? null,
    cabinClass: normalizeCabinClass(url.searchParams.get('cabinclass')),
    passengers: toPassengerCount(url.searchParams.get('adults')),
  };
};

/**
 * Generic fallback for sites that expose the itinerary as query params —
 * covers Traqora's own search page and several smaller aggregators.
 */
const matchQueryParams: SiteMatcher = (url) => {
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
    return null;
  };

  const origin = get('origin', 'from', 'departureAirport', 'orig')?.toUpperCase();
  const destination = get('destination', 'to', 'arrivalAirport', 'dest')?.toUpperCase();
  if (!origin || !destination || !IATA.test(origin) || !IATA.test(destination)) {
    return null;
  }

  const departureDate = get('departureDate', 'departure', 'depart', 'date');
  const returnDate = get('returnDate', 'return');

  return {
    origin,
    destination,
    departureDate:
      departureDate && isValidIsoDate(departureDate) ? departureDate : undefined,
    returnDate: returnDate && isValidIsoDate(returnDate) ? returnDate : null,
    cabinClass: normalizeCabinClass(get('cabinClass', 'cabin', 'class')),
    passengers: toPassengerCount(get('passengers', 'adults')),
  };
};

function toPassengerCount(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 9 ? value : undefined;
}

const MATCHERS: SiteMatcher[] = [
  matchKayak,
  matchSkyscanner,
  matchExpedia,
  matchQueryParams,
];

/**
 * Identifies the itinerary a search results page is showing.
 *
 * Returns null unless origin, destination, and a departure date were all
 * recovered — a tracker without a date cannot be compared over time.
 */
export function detectItinerary(rawUrl: string): DetectedItinerary | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  for (const matcher of MATCHERS) {
    const partial = matcher(url);
    if (!partial?.origin || !partial.destination || !partial.departureDate) continue;
    if (partial.origin === partial.destination) continue;
    if (!isValidIsoDate(partial.departureDate)) continue;

    const returnDate =
      partial.returnDate && isValidIsoDate(partial.returnDate)
        ? partial.returnDate
        : null;
    if (returnDate && returnDate < partial.departureDate) continue;

    return {
      origin: partial.origin,
      destination: partial.destination,
      departureDate: partial.departureDate,
      returnDate,
      cabinClass: partial.cabinClass ?? 'economy',
      passengers: partial.passengers ?? 1,
      source: url.hostname,
      sourceUrl: url.toString(),
    };
  }

  return null;
}

/** True when two detections describe the same tracked route. */
export function isSameItinerary(
  a: DetectedItinerary | null,
  b: DetectedItinerary | null,
): boolean {
  if (!a || !b) return false;
  return (
    a.origin === b.origin &&
    a.destination === b.destination &&
    a.departureDate === b.departureDate &&
    a.returnDate === b.returnDate &&
    a.cabinClass === b.cabinClass
  );
}
