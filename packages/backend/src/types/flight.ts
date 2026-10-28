export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export type FlightSortBy = 'price' | 'duration' | 'departure_time' | 'rating';

export type SortOrder = 'asc' | 'desc';

export interface FlightSegmentCarriers {
  marketingCarrier: string;
  operatingCarrier: string;
  from?: string;
  to?: string;
  departureAt?: string;
  arrivalAt?: string;
}

export interface FlightSegmentCabin {
  segmentIndex: number;
  origin: string;
  destination: string;
  carrier: string;
  flightNumber: string;
  cabinClass: CabinClass;
  fareBrand: string;
}

/** One itinerary segment: its fare brand and cabin (#904) together with its carriers (#903). */
export type FlightSegment = FlightSegmentCabin & Partial<FlightSegmentCarriers>;

export type FlightFreshness = 'fresh' | 'stale' | 'unknown';

export interface FlightProvenance {
  source: string;
  imported_at: string;
  source_updated_at?: string;
  freshness: FlightFreshness;
}

export interface Flight {
  id: string;
  from: string;
  to: string;
  date: string;
  departure_time: string;
  airline: string;
  stops: number;
  duration: number;
  price: number;
  rating: number;
  available_seats: number;
  class: CabinClass;
  /** Upstream provider offer identifier (#914). */
  providerOfferId?: string;
  marketingCarrier?: string;
  operatingCarrier?: string;
  segments?: FlightSegment[];
  provenance?: FlightProvenance;
}

export interface EnrichedFlight extends Flight {
  pricing: {
    usd: number;
    xlm: number;
    xlm_usd_rate: number;
  };
  on_chain: {
    listed: boolean;
    reservable: boolean;
    contract_flight_id: string;
    available_seats: number;
  };
}

export interface FlightSearchCriteria {
  from: string;
  to: string;
  date: string;
  passengers: number;
  travelClass: CabinClass;
  priceMin?: number;
  priceMax?: number;
  airlines?: string[];
  stops?: number[];
  durationMax?: number;
  sortBy: FlightSortBy;
  sortOrder?: SortOrder;
  cursor?: string;
  pageSize: number;
}

import { CursorPaginationMeta } from './pagination';

export interface FlightSearchResponse {
  data: EnrichedFlight[];
  pagination: CursorPaginationMeta;
}

export interface FlightPagination {
  limit: number;
  offset: number;
}
