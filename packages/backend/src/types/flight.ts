export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export type FlightSortBy = 'price' | 'duration' | 'departure_time' | 'rating';

export type SortOrder = 'asc' | 'desc';

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
