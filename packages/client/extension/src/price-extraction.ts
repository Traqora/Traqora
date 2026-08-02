import type { ParsedPrice, PriceSighting } from './types';

/**
 * Currency symbols we can map back to an ISO code without ambiguity.
 * `$` deliberately resolves to USD — sites that mean CAD/AUD virtually
 * always emit an explicit code alongside it, which takes precedence.
 */
const SYMBOL_TO_CURRENCY: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  R$: 'BRL',
  'C$': 'CAD',
  'A$': 'AUD',
  CHF: 'CHF',
};

const ISO_CODE_PATTERN = /\b([A-Z]{3})\b/;

/** Currencies whose minor unit is the major unit (no cents). */
const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK']);

/**
 * Splits a numeric string into a whole/fraction pair, resolving `.` vs `,`
 * ambiguity by position rather than locale guessing.
 *
 * Rules, in order:
 *  - both separators present → the rightmost one is the decimal mark
 *  - one separator, followed by exactly 3 digits, and it is not the only
 *    grouping → treated as a thousands separator ("1,234" = 1234)
 *  - one separator followed by 1-2 digits → decimal mark ("12,5" = 12.5)
 */
export function normalizeNumericString(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,]/g, '');
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let decimalSepIndex = -1;

  if (lastComma !== -1 && lastDot !== -1) {
    decimalSepIndex = Math.max(lastComma, lastDot);
  } else if (lastComma !== -1 || lastDot !== -1) {
    const sepIndex = lastComma !== -1 ? lastComma : lastDot;
    const trailingDigits = cleaned.length - sepIndex - 1;
    // "1,234" is grouping; "1,23" and "1,2" are decimals.
    decimalSepIndex = trailingDigits === 3 ? -1 : sepIndex;
  }

  let wholePart: string;
  let fractionPart: string;

  if (decimalSepIndex === -1) {
    wholePart = cleaned.replace(/[.,]/g, '');
    fractionPart = '';
  } else {
    wholePart = cleaned.slice(0, decimalSepIndex).replace(/[.,]/g, '');
    fractionPart = cleaned.slice(decimalSepIndex + 1).replace(/[.,]/g, '');
  }

  if (!wholePart && !fractionPart) return null;

  const value = Number(`${wholePart || '0'}.${fractionPart || '0'}`);
  return Number.isFinite(value) ? value : null;
}

/** Resolves a currency from an explicit ISO code, else a symbol, else USD. */
export function detectCurrency(text: string, fallback = 'USD'): string {
  const isoMatch = text.toUpperCase().match(ISO_CODE_PATTERN);
  if (isoMatch && SYMBOL_TO_CURRENCY[isoMatch[1]] !== undefined) return isoMatch[1];
  if (isoMatch && /^(USD|EUR|GBP|JPY|INR|CAD|AUD|CHF|SEK|NOK|DKK|SGD|HKD|NZD|MXN|ZAR|BRL|KRW)$/.test(isoMatch[1])) {
    return isoMatch[1];
  }

  // Longest symbols first so "C$" wins over "$".
  const symbols = Object.keys(SYMBOL_TO_CURRENCY).sort((a, b) => b.length - a.length);
  for (const symbol of symbols) {
    if (text.includes(symbol)) return SYMBOL_TO_CURRENCY[symbol];
  }

  return fallback;
}

/**
 * Parses a rendered price string into minor units.
 *
 * Returns null for strings with no usable number so callers can skip
 * non-price DOM nodes without special-casing.
 */
export function parsePrice(text: string, fallbackCurrency = 'USD'): ParsedPrice | null {
  if (!text || typeof text !== 'string') return null;

  const trimmed = text.trim();
  if (!trimmed || !/\d/.test(trimmed)) return null;

  const value = normalizeNumericString(trimmed);
  if (value === null || value <= 0) return null;

  const currency = detectCurrency(trimmed, fallbackCurrency);
  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currency) ? 1 : 100;

  return {
    amountCents: Math.round(value * multiplier),
    currency,
  };
}

/**
 * Selectors that carry fare totals on the sites we support. Broad on
 * purpose — a false positive is discarded by `parsePrice`, whereas a missed
 * selector means no tracking at all.
 */
export const PRICE_SELECTORS = [
  '[data-testid*="price" i]',
  '[class*="price" i]',
  '[aria-label*="price" i]',
  '[data-price]',
  '[itemprop="price"]',
];

/** Ignore figures far outside plausible airfare — banners, phone numbers, seat rows. */
const MIN_PLAUSIBLE_CENTS = 1000; // $10
const MAX_PLAUSIBLE_CENTS = 5_000_000; // $50,000

export function isPlausibleFare(price: ParsedPrice): boolean {
  return (
    price.amountCents >= MIN_PLAUSIBLE_CENTS &&
    price.amountCents <= MAX_PLAUSIBLE_CENTS
  );
}

/**
 * Scrapes plausible fares out of a document, de-duplicated by
 * amount+currency so a price repeated across the page counts once.
 */
export function extractPricesFromDocument(
  doc: Document,
  options: { source: string; sourceUrl: string; fallbackCurrency?: string; now?: () => Date } = {
    source: '',
    sourceUrl: '',
  },
): PriceSighting[] {
  const now = options.now ?? (() => new Date());
  const seen = new Set<string>();
  const sightings: PriceSighting[] = [];

  for (const selector of PRICE_SELECTORS) {
    const nodes = doc.querySelectorAll(selector);
    nodes.forEach((node) => {
      const raw =
        node.getAttribute('data-price') ??
        node.getAttribute('content') ??
        node.textContent ??
        '';
      const parsed = parsePrice(raw, options.fallbackCurrency ?? 'USD');
      if (!parsed || !isPlausibleFare(parsed)) return;

      const key = `${parsed.amountCents}:${parsed.currency}`;
      if (seen.has(key)) return;
      seen.add(key);

      sightings.push({
        ...parsed,
        source: options.source,
        sourceUrl: options.sourceUrl,
        carrierCode: extractCarrierCode(node),
        observedAt: now().toISOString(),
      });
    });
  }

  return sightings;
}

/** Best-effort carrier lookup from the price node's surrounding markup. */
export function extractCarrierCode(node: Element): string | null {
  const container = node.closest('[data-carrier], [data-airline], [data-testid*="carrier" i]');
  const value =
    container?.getAttribute('data-carrier') ??
    container?.getAttribute('data-airline') ??
    null;
  if (!value) return null;

  const trimmed = value.trim().toUpperCase();
  return /^[A-Z0-9]{2,3}$/.test(trimmed) ? trimmed : null;
}

/** The cheapest sighting, which is what gets reported to the backend. */
export function lowestSighting(sightings: PriceSighting[]): PriceSighting | null {
  if (sightings.length === 0) return null;
  return sightings.reduce((min, s) => (s.amountCents < min.amountCents ? s : min));
}
