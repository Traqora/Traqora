export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export type FlightSortBy = 'price' | 'duration' | 'departure_time' | 'rating';

export type SortOrder = 'asc' | 'desc';

export interface FlightSegmentCabin {
  segmentIndex: number;
  origin: string;
  destination: string;
  carrier: string;
  flightNumber: string;
  cabinClass: CabinClass;
  fareBrand: string;
}

/** One leg of a connecting itinerary. */
export type FlightSegment = FlightSegmentCabin;

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
  /** Ordered legs when the provider returned a connecting itinerary. */
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

export interface ProviderResultSummary {
  /** False when at least one upstream provider failed and another returned flights. */
  complete: boolean;
  succeeded: number;
  failed: number;
}

export interface FlightSearchResponse {
  data: EnrichedFlight[];
  pagination: CursorPaginationMeta;
  /**
   * Present on flight-search responses. Counts only — never provider names,
   * credentials, or upstream error text.
   */
  provider_results: ProviderResultSummary;
}

export interface FlightPagination {
  limit: number;
  offset: number;
}
