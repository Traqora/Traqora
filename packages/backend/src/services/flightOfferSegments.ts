/**
 * Per-segment fare brand and cabin (#904).
 *
 * Mixed-cabin itineraries must retain each segment's fare brand and cabin
 * instead of collapsing to the first traveller pricing class.
 */

import type { AmadeusFlightData, AmadeusSegment } from "../types/flightSync";
import type { CabinClass } from "../types/flight";

export interface OfferSegmentCabin {
  segmentIndex: number;
  origin: string;
  destination: string;
  carrier: string;
  flightNumber: string;
  cabinClass: CabinClass;
  fareBrand: string;
}

const CABIN_MAP: Record<string, CabinClass> = {
  ECONOMY: "economy",
  PREMIUMECONOMY: "premium_economy",
  PREMIUM_ECONOMY: "premium_economy",
  BUSINESS: "business",
  FIRST: "first",
  Y: "economy",
  W: "premium_economy",
  C: "business",
  J: "business",
  F: "first",
};

export function normalizeCabin(raw?: string | null): CabinClass {
  if (!raw) return "economy";
  const key = raw.replace(/\s+/g, "").toUpperCase();
  return CABIN_MAP[key] || "economy";
}

export function retainSegmentFareAndCabin(offer: AmadeusFlightData): OfferSegmentCabin[] {
  const segments: AmadeusSegment[] = offer.itineraries?.[0]?.segments ?? [];
  const fareDetails = offer.travelerPricings?.[0]?.fareDetailsBySegment ?? [];

  return segments.map((segment, index) => {
    const details = fareDetails[index];
    return {
      segmentIndex: index,
      origin: segment.departure.iataCode,
      destination: segment.arrival.iataCode,
      carrier: segment.operatingAirline?.carrierCode || offer.validatingAirlineCodes?.[0] || "XX",
      flightNumber: segment.number || "",
      cabinClass: normalizeCabin(details?.cabin || details?.class || segment.class),
      fareBrand: details?.fareBasis || offer.pricingOptions?.fareType?.[0] || "published",
    };
  });
}

export function hasMixedCabin(segments: OfferSegmentCabin[]): boolean {
  return new Set(segments.map((segment) => segment.cabinClass)).size > 1;
}
