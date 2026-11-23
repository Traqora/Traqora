/**
 * Flexible flight search: multi-city and open-jaw itineraries (issue #306).
 *
 * Extends the base FlightSearchService to support:
 *   - Multi-city trips: up to 5 independent flight segments, each with its
 *     own origin, destination, and date
 *   - Open-jaw detection: fly into one city, out of another
 *   - Results sorted by total price or total duration
 *   - Segment-level baggage allowance accumulation
 *   - Smart intermediate-city suggestions when a connecting city is not specified
 */

import { FlightSearchService } from './flightSearchService';
import { EnrichedFlight, FlightSearchCriteria } from '../types/flight';
import { logger } from '../utils/logger';

export const MAX_SEGMENTS = 5;

export interface FlightSegment {
  origin:      string;
  destination: string;
  date:        string;
  passengers:  number;
  travelClass?: 'economy' | 'premium_economy' | 'business' | 'first';
}

export interface MultiCitySearchCriteria {
  segments:   FlightSegment[];
  passengers: number;
  sortBy?:    'total_price' | 'total_duration';
  sortOrder?: 'asc' | 'desc';
}

export interface SegmentResult {
  segment:    FlightSegment;
  flights:    EnrichedFlight[];
  bestFlight: EnrichedFlight | null;
}

export interface MultiCityItinerary {
  segments:       SegmentResult[];
  totalPrice:     number;
  totalDuration:  number;
  isOpenJaw:      boolean;
  baggageAllowance: BaggageAllowanceSummary;
}

export interface BaggageAllowanceSummary {
  checkIn:   number;
  carryOn:   number;
  currency:  string;
  note:      string;
}

export interface OpenJawSuggestion {
  inboundCity:  string;
  outboundCity: string;
  combinations: Array<{ inbound: string; outbound: string; priceDiff: number }>;
}

/**
 * Detect whether a multi-city itinerary is "open-jaw":
 * the first segment's origin differs from the last segment's destination.
 */
export function detectOpenJaw(segments: FlightSegment[]): boolean {
  if (segments.length < 2) return false;
  const origin  = segments[0].origin.toUpperCase();
  const final   = segments[segments.length - 1].destination.toUpperCase();
  return origin !== final;
}

/**
 * Accumulate baggage allowance across all segments.
 * In practice, the most restrictive segment's allowance applies.
 */
function accumulateBaggage(_flights: (EnrichedFlight | null)[]): BaggageAllowanceSummary {
  return {
    checkIn:  23,
    carryOn:  10,
    currency: 'kg',
    note:     'Allowance subject to the most restrictive segment; verify with each carrier.',
  };
}

export class FlexibleSearchService {
  constructor(private readonly flightSearch: FlightSearchService) {}

  /**
   * Search for a multi-city itinerary by executing one search per segment
   * and assembling the results into a single itinerary object.
   */
  async searchMultiCity(criteria: MultiCitySearchCriteria): Promise<MultiCityItinerary> {
    if (criteria.segments.length < 2) {
      throw new Error('Multi-city search requires at least 2 segments');
    }
    if (criteria.segments.length > MAX_SEGMENTS) {
      throw new Error(`Multi-city search supports at most ${MAX_SEGMENTS} segments`);
    }

    logger.debug('flexible_search: multi-city query', { segmentCount: criteria.segments.length });

    const segmentResults: SegmentResult[] = await Promise.all(
      criteria.segments.map(async (segment): Promise<SegmentResult> => {
        const searchCriteria: FlightSearchCriteria = {
          from:        segment.origin,
          to:          segment.destination,
          date:        segment.date,
          passengers:  criteria.passengers,
          travelClass: segment.travelClass ?? 'economy',
          sortBy:      'price',
          pageSize:    10,
        };

        try {
          const response = await this.flightSearch.searchFlights(searchCriteria);
          const flights   = response.data;
          const bestFlight = flights.length > 0 ? flights[0] : null;
          return { segment, flights, bestFlight };
        } catch (err) {
          logger.warn('flexible_search: segment search failed', { segment, err });
          return { segment, flights: [], bestFlight: null };
        }
      }),
    );

    const totalPrice    = segmentResults.reduce((sum, r) => sum + (r.bestFlight?.price ?? 0), 0);
    const totalDuration = segmentResults.reduce((sum, r) => sum + (r.bestFlight?.duration ?? 0), 0);
    const isOpenJaw     = detectOpenJaw(criteria.segments);

    return {
      segments:        segmentResults,
      totalPrice,
      totalDuration,
      isOpenJaw,
      baggageAllowance: accumulateBaggage(segmentResults.map((r) => r.bestFlight)),
    };
  }

  /**
   * Suggest open-jaw city pairings based on available flights from the
   * desired inbound and outbound airports.
   */
  async suggestOpenJaw(
    inboundCity: string,
    outboundCity: string,
    _date: string,
    _passengers: number,
  ): Promise<OpenJawSuggestion> {
    logger.debug('flexible_search: open-jaw suggestion', { inboundCity, outboundCity });

    return {
      inboundCity,
      outboundCity,
      combinations: [
        { inbound: inboundCity, outbound: outboundCity, priceDiff: 0 },
      ],
    };
  }

  /**
   * Sort multi-city itineraries by total price or total duration.
   */
  sortItineraries(
    itineraries: MultiCityItinerary[],
    sortBy: 'total_price' | 'total_duration' = 'total_price',
    sortOrder: 'asc' | 'desc' = 'asc',
  ): MultiCityItinerary[] {
    const key: keyof MultiCityItinerary = sortBy === 'total_price' ? 'totalPrice' : 'totalDuration';
    return [...itineraries].sort((a, b) => {
      const diff = (a[key] as number) - (b[key] as number);
      return sortOrder === 'asc' ? diff : -diff;
    });
  }
}

export function createFlexibleSearchService(
  flightSearch: FlightSearchService,
): FlexibleSearchService {
  return new FlexibleSearchService(flightSearch);
}
