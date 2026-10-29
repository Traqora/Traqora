/**
 * Marketing vs operating carrier identity for codeshare segments (#903).
 *
 * Preserve both identities. The marketing carrier sells the flight number; the
 * operating carrier flies the aircraft. When they differ, UIs must label them
 * separately instead of showing only the marketing carrier.
 *
 * Expected behavior
 * -----------------
 * - Both codes are normalised to uppercase IATA codes.
 * - Missing operating carrier falls back to the marketing carrier.
 * - `isCodeshare` is true only when the two codes differ.
 *
 * Failure cases
 * -------------
 * - Missing marketing carrier returns a validation error.
 * - Blank / non-string carrier codes are treated as missing.
 */

export interface SegmentCarriers {
  marketingCarrier: string;
  operatingCarrier: string;
  isCodeshare: boolean;
}

export interface CarrierLabels {
  marketedBy: string;
  operatedBy: string;
  isCodeshare: boolean;
}

export function normalizeCarrierCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return code ? code : null;
}

export function resolveSegmentCarriers(input: {
  marketingCarrier?: unknown;
  operatingCarrier?: unknown;
  /** Amadeus-style marketing code on the segment. */
  carrierCode?: unknown;
  operatingAirline?: { carrierCode?: unknown } | null;
}): SegmentCarriers | { error: "missing_marketing_carrier" } {
  const marketing =
    normalizeCarrierCode(input.marketingCarrier) ||
    normalizeCarrierCode(input.carrierCode);
  if (!marketing) {
    return { error: "missing_marketing_carrier" };
  }
  const operating =
    normalizeCarrierCode(input.operatingCarrier) ||
    normalizeCarrierCode(input.operatingAirline?.carrierCode) ||
    marketing;
  return {
    marketingCarrier: marketing,
    operatingCarrier: operating,
    isCodeshare: marketing !== operating,
  };
}

export function carrierLabels(segment: SegmentCarriers): CarrierLabels {
  return {
    marketedBy: `Marketed by ${segment.marketingCarrier}`,
    operatedBy: `Operated by ${segment.operatingCarrier}`,
    isCodeshare: segment.isCodeshare,
  };
}
