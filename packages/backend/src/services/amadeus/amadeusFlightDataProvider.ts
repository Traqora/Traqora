/**
 * Amadeus flight data provider (#779) — secondary source for search failover.
 *
 * Adapts the existing AmadeusAnalyticsClient (used by flight sync) to the
 * OffchainFlightDataProvider seam so FailoverFlightDataProvider can fall back
 * to it when the offchain repository provider fails.
 *
 * Contract
 * --------
 *   isConfigured() : true when AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET are
 *     present. The default factory only wires this provider into the failover
 *     chain when configured, so development/test environments without
 *     credentials keep the single-provider behaviour.
 *
 *   search(criteria, pagination) : maps FlightSearchCriteria onto the Amadeus
 *     flight-offers search and converts each offer into the shared Flight
 *     shape (see mapAmadeusOfferToFlight). Throws whatever the client throws —
 *     failover handling is the FailoverFlightDataProvider's job, not ours.
 *
 * Mapping notes (documented for operators):
 *   - id is synthesised deterministically as
 *     `amadeus-<carrier><number>-<departure ISO>` (no DB row is created here;
 *     persistence stays with flight sync).
 *   - price is USD as returned by Amadeus (Flight.price feeds pricing.usd).
 *   - rating has no Amadeus equivalent and is reported as 0.
 *   - cabin class is derived from the booking class (RBD) of the first
 *     traveller pricing; unknown codes map to economy.
 */

import { config } from '../../config';
import {
  CabinClass,
  Flight,
  FlightPagination,
  FlightSearchCriteria,
} from '../../types/flight';
import type {
  AmadeusFlightData,
  AmadeusTravelerPricing,
} from '../../types/flightSync';
import { OffchainFlightDataProvider } from '../offchainFlightDataProvider';
import { AmadeusAnalyticsClient } from './amadeusClient';

/** Minimal config surface — keeps the provider testable without env vars. */
export interface AmadeusConfigSource {
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  timeout?: number;
}

const RBD_TO_CABIN: Record<string, CabinClass> = {
  Y: 'economy',
  M: 'economy',
  B: 'economy',
  H: 'economy',
  W: 'premium_economy',
  C: 'business',
  J: 'business',
  D: 'business',
  F: 'first',
  A: 'first',
};

/** "PT7H30M" / "P1DT2H" → minutes; 0 when unparseable. */
export function parseIsoDurationMinutes(duration: string): number {
  const match = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/.exec(duration || '');
  if (!match) return 0;
  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return days * 24 * 60 + hours * 60 + minutes;
}

function firstCabinClass(travelerPricings?: AmadeusTravelerPricing[]): CabinClass {
  const rbd = travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.class;
  return (rbd && RBD_TO_CABIN[rbd.toUpperCase()]) || 'economy';
}

export function mapAmadeusOfferToFlight(offer: AmadeusFlightData): Flight | null {
  const itinerary = offer.itineraries?.[0];
  const firstSegment = itinerary?.segments?.[0];
  const lastSegment = itinerary?.segments?.[itinerary.segments.length - 1];
  if (!firstSegment || !lastSegment) {
    return null;
  }

  const departureIso = firstSegment.departure.at;
  const departure = new Date(departureIso);
  if (Number.isNaN(departure.getTime())) {
    return null;
  }

  const carrier = firstSegment.operatingAirline?.carrierCode || offer.validatingAirlineCodes?.[0] || 'XX';
  const number = firstSegment.number || '';

  return {
    id: `amadeus-${carrier}${number}-${departureIso}`,
    from: firstSegment.departure.iataCode,
    to: lastSegment.arrival.iataCode,
    date: departureIso.slice(0, 10),
    departure_time: departureIso,
    airline: carrier,
    stops: Math.max(0, itinerary.segments.length - 1),
    duration:
      parseIsoDurationMinutes(itinerary.duration) ||
      Math.max(
        0,
        Math.round(
          (new Date(lastSegment.arrival.at).getTime() - departure.getTime()) / 60000,
        ),
      ),
    price: parseFloat(offer.price.grandTotal) || 0,
    rating: 0,
    available_seats: offer.numberOfBookableSeats ?? 0,
    class: firstCabinClass(offer.travelerPricings),
  };
}

export class AmadeusFlightDataProvider implements OffchainFlightDataProvider {
  private readonly cfg: AmadeusConfigSource;
  private client: AmadeusAnalyticsClient | null = null;

  constructor(cfg: AmadeusConfigSource = config as AmadeusConfigSource) {
    this.cfg = cfg;
  }

  isConfigured(): boolean {
    return Boolean(this.cfg.clientId && this.cfg.clientSecret);
  }

  private getClient(): AmadeusAnalyticsClient {
    if (!this.client) {
      this.client = new AmadeusAnalyticsClient({
        clientId: this.cfg.clientId as string,
        clientSecret: this.cfg.clientSecret as string,
        baseUrl: this.cfg.baseUrl,
        timeout: this.cfg.timeout,
      });
    }
    return this.client;
  }

  async search(
    criteria: FlightSearchCriteria,
    pagination: FlightPagination,
  ): Promise<Flight[]> {
    if (!this.isConfigured()) {
      throw new Error('Amadeus provider is not configured (missing AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET)');
    }

    const offers = await this.getClient().searchFlights({
      originLocationCode: criteria.from,
      destinationLocationCode: criteria.to,
      departureDate: criteria.date,
      adults: Math.max(1, criteria.passengers || 1),
      max: pagination.limit,
    });

    return offers
      .map(mapAmadeusOfferToFlight)
      .filter((flight): flight is Flight => flight !== null);
  }
}
