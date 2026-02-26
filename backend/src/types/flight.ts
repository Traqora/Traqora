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

export interface FlightSearchCriteria {
  from: string;
  to: string;
  date: string;
  passengers: number;
  travelClass: CabinClass;
  priceMin?: number;
  priceMax?: number;
  airlines?: string[];
  stops?: number;
  durationMax?: number;
  sortBy: FlightSortBy;
  sortOrder?: SortOrder;
  cursor?: string;
  pageSize: number;
}

export interface FlightSearchResponse {
  data: Flight[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    page_size: number;
  };
}

export interface FlightPagination {
  limit: number;
  offset: number;
}