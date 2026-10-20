/**
 * Flight Synchronization Service Types
 * Defines interfaces for flight data from multiple airline systems and APIs
 */

// ============================================================================
// AMADEUS API TYPES
// ============================================================================

export interface AmadeusFlightData {
  id: string;
  type: 'flight';
  source: {
    name: string;
  };
  instantTicketingRequired: boolean;
  nonHomogeneous: boolean;
  oneWay: boolean;
  lastTicketingDate: string;
  numberOfBookableSeats: number;
  itineraries: AmadeusItinerary[];
  price: AmadeusPrice;
  pricingOptions: {
    fareType: string[];
    includedCheckedBagsOnly: boolean;
  };
  validatingAirlineCodes: string[];
  travelerPricings: AmadeusTravelerPricing[];
}

export interface AmadeusItinerary {
  duration: string;
  segments: AmadeusSegment[];
}

export interface AmadeusSegment {
  departure: {
    iataCode: string;
    at: string;
    terminal?: string;
  };
  arrival: {
    iataCode: string;
    at: string;
    terminal?: string;
  };
  operatingAirline: {
    carrierCode: string;
  };
  aircraft: {
    code: string;
  };
  operating: string;
  number: string;
  aircraft_type?: string;
  class?: string;
  blacklistedInEU: boolean;
}

export interface AmadeusPrice {
  total: string;
  base: string;
  fee: string;
  grandTotal: string;
  currency: string;
}

export interface AmadeusTravelerPricing {
  travelerId: string;
  fareOption: string;
  travelerType: string;
  price: {
    total: string;
    base: string;
  };
  fareDetailsBySegment: {
    segmentId: string;
    cabin: string;
    fareBasis: string;
    class: string;
    includedCheckedBags: {
      weight: number;
      weightUnit: string;
    };
  }[];
}

export interface AmadeusFlightOffer {
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureTime: string;
  arrivalTime: string;
  airline: string;
  aircraft: string;
  seats: number;
  price: number;
  currency: string;
}

export interface AmadeusFlightStatus {
  flightNumber: string;
  airline: string;
  operationalStatus: string; // 'SCHEDULED', 'DEPARTED', 'IN_FLIGHT', 'LANDED', 'CANCELLED', 'DIVERTED'
  departure?: {
    actualTime?: string;
    estimatedTime?: string;
    terminal?: string;
    gate?: string;
  };
  arrival?: {
    actualTime?: string;
    estimatedTime?: string;
    terminal?: string;
    gate?: string;
  };
}

// ============================================================================
// AIRLINE-SPECIFIC ADAPTER TYPES
// ============================================================================

export interface AirlineFlightData {
  flightNumber: string;
  airlineCode: string;
  departureAirport: string;
  arrivalAirport: string;
  scheduledDeparture: Date;
  scheduledArrival?: Date;
  actualDeparture?: Date;
  actualArrival?: Date;
  estimatedDeparture?: Date;
  estimatedArrival?: Date;
  status: FlightStatus;
  gate?: string;
  terminal?: string;
  aircraft?: string;
  capacity: number;
  seatsAvailable: number;
  price: number;
  priceCurrency: string;
  delayMinutes?: number;
  cancellationReason?: string;
  equipment?: string;
  codeshare?: boolean;
  codeshareOperator?: string;
}

export type FlightStatus = 
  | 'SCHEDULED'
  | 'DELAYED'
  | 'CANCELLED'
  | 'DEPARTED'
  | 'IN_FLIGHT'
  | 'LANDED'
  | 'DIVERTED'
  | 'GATE_CHANGED';

// ============================================================================
// FLIGHT SYNC SERVICE TYPES
// ============================================================================

export interface SyncFlightRequest {
  flightNumber: string;
  airline: string;
  departureDate: string;
  departureAirport?: string;
  arrivalAirport?: string;
}

export interface SyncFlightResponse {
  success: boolean;
  flightId?: string;
  updated: boolean;
  message: string;
  errors?: string[];
}

export interface FlightSyncJob {
  id: string;
  type: 'FULL_SYNC' | 'INCREMENTAL_SYNC' | 'MANUAL_SYNC';
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startTime: Date;
  endTime?: Date;
  flightsProcessed: number;
  flightsUpdated: number;
  errors: SyncError[];
  details?: Record<string, any>;
}

export interface SyncError {
  flightNumber: string;
  airline: string;
  timestamp: Date;
  error: string;
  source: string;
}

export interface FlightDataConflict {
  flightId: string;
  flightNumber: string;
  field: string;
  currentValue: any;
  newValue: any;
  source1: string;
  source2: string;
  timestamp: Date;
  resolved: boolean;
  resolution?: 'SOURCE1' | 'SOURCE2' | 'MANUAL';
}

export interface SyncConfig {
  enabled: boolean;
  interval: number; // milliseconds
  amadeusEnabled: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerResetTime: number;
  cacheTTL: number; // seconds
  maxSyncRetries: number;
  webhookEnabled: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  expiresAt: Date;
  source: string;
}

export interface SyncWebhookPayload {
  event: 'FLIGHT_UPDATED' | 'FLIGHT_CANCELLED' | 'FLIGHT_DELAYED' | 'GATE_CHANGED' | 'STATUS_CHANGED';
  flight: {
    id: string;
    flightNumber: string;
    airline: string;
    status: FlightStatus;
    delayMinutes?: number;
    gate?: string;
    updatedAt: Date;
  };
  previousData?: Record<string, any>;
  changes: Record<string, { old: any; new: any }>;
  timestamp: Date;
  source: string;
}

// ============================================================================
// CIRCUIT BREAKER STATE
// ============================================================================

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  nextRetryTime?: Date;
}

// ============================================================================
// AIRLINE ADAPTER INTERFACE
// ============================================================================

export interface IAirlineAdapter {
  airlineCode: string;
  name: string;
  priority: number; // Lower = higher priority in conflict resolution

  /**
   * Fetch flight data for a specific flight
   */
  fetchFlightData(
    flightNumber: string,
    departureDate: string
  ): Promise<AirlineFlightData | null>;

  /**
   * Fetch multiple flights
   */
  fetchFlights(filters: {
    airline?: string;
    flightPattern?: string;
    date?: string;
  }): Promise<AirlineFlightData[]>;

  /**
   * Fetch real-time flight status
   */
  fetchFlightStatus(
    flightNumber: string,
    departureDate: string
  ): Promise<Partial<AirlineFlightData> | null>;

  /**
   * Verify API connectivity
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get adapter-specific metadata
   */
  getMetadata(): {
    name: string;
    version: string;
    apiEndpoint: string;
    rateLimit?: number;
  };
}

// ============================================================================
// SYNC JOB TYPES
// ============================================================================

export interface ScheduledSyncConfig {
  intervalMinutes: number;
  enabled: boolean;
  startTime?: string; // HH:MM format
  endTime?: string;
}
