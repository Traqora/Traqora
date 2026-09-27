/**
 * Flight provider failover (#779) — regression tests.
 *
 * Covers
 * ------
 *   FailoverFlightDataProvider:
 *     - happy path: primary succeeds → its result is used, secondary untouched
 *     - failover: primary throws → secondary result is used and the failover
 *       is logged
 *     - FAILURE MODE: every provider fails → FlightProviderUnavailableError
 *       carrying one attempt record per provider, in order
 *     - priority order: when both providers work, the first in the chain wins
 *
 *   AmadeusFlightDataProvider (secondary source):
 *     - offer → Flight mapping (direct and connecting itineraries)
 *     - FAILURE MODE: malformed offers map to null and are dropped
 *     - FAILURE MODE: unconfigured credentials → search throws
 *     - configured client path returns mapped flights
 *     - parseIsoDurationMinutes
 */

import {
  FailoverFlightDataProvider,
  FlightProviderUnavailableError,
  NamedFlightDataProvider,
} from '../src/services/failoverFlightDataProvider';
import {
  AmadeusFlightDataProvider,
  mapAmadeusOfferToFlight,
  parseIsoDurationMinutes,
} from '../src/services/amadeus/amadeusFlightDataProvider';
import type { AmadeusFlightData } from '../src/types/flightSync';
import { Flight, FlightPagination, FlightSearchCriteria } from '../src/types/flight';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const criteria: FlightSearchCriteria = {
  from: 'JFK',
  to: 'LAX',
  date: '2026-05-01',
  passengers: 1,
  sortBy: 'price',
  pageSize: 10,
} as unknown as FlightSearchCriteria;

const pagination: FlightPagination = { limit: 10, offset: 0 };

function makeFlight(id: string): Flight {
  return {
    id,
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T09:00:00.000Z',
    airline: 'AA',
    stops: 0,
    duration: 360,
    price: 199.99,
    rating: 4.5,
    available_seats: 12,
    class: 'economy',
  };
}

function makeProvider(
  name: string,
  impl: jest.Mock,
): NamedFlightDataProvider {
  return { name, provider: { search: impl } };
}

describe('FailoverFlightDataProvider (#779)', () => {
  it('happy path: primary success short-circuits the chain', async () => {
    const primary = jest.fn().mockResolvedValue([makeFlight('f-1')]);
    const secondary = jest.fn().mockResolvedValue([makeFlight('f-2')]);
    const provider = new FailoverFlightDataProvider([
      makeProvider('primary', primary),
      makeProvider('secondary', secondary),
    ]);

    const flights = await provider.search(criteria, pagination);

    expect(flights.map((f) => f.id)).toEqual(['f-1']);
    expect(primary).toHaveBeenCalledTimes(1);
    expect(secondary).not.toHaveBeenCalled();
  });

  it('fails over to the secondary when the primary throws', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('db pool exhausted'));
    const secondary = jest.fn().mockResolvedValue([makeFlight('f-2')]);
    const provider = new FailoverFlightDataProvider([
      makeProvider('primary', primary),
      makeProvider('secondary', secondary),
    ]);

    const flights = await provider.search(criteria, pagination);

    expect(flights.map((f) => f.id)).toEqual(['f-2']);
    expect(secondary).toHaveBeenCalledTimes(1);
  });

  it('FAILURE MODE: all providers failing raises FlightProviderUnavailableError with the attempt trail', async () => {
    const primary = jest.fn().mockRejectedValue(new Error('db down'));
    const secondary = jest.fn().mockRejectedValue(new Error('401 unauthorized'));
    const provider = new FailoverFlightDataProvider([
      makeProvider('primary', primary),
      makeProvider('secondary', secondary),
    ]);

    await expect(provider.search(criteria, pagination)).rejects.toThrow(
      FlightProviderUnavailableError,
    );

    try {
      await provider.search(criteria, pagination);
    } catch (error: any) {
      expect(error.attempts).toHaveLength(2);
      expect(error.attempts[0]).toMatchObject({
        provider: 'primary',
        succeeded: false,
        error: 'db down',
      });
      expect(error.attempts[1]).toMatchObject({
        provider: 'secondary',
        succeeded: false,
        error: '401 unauthorized',
      });
      expect(error.message).toContain('primary');
      expect(error.message).toContain('secondary');
    }
  });

  it('respects chain priority when every provider succeeds', async () => {
    const first = jest.fn().mockResolvedValue([makeFlight('first')]);
    const second = jest.fn().mockResolvedValue([makeFlight('second')]);
    const provider = new FailoverFlightDataProvider([
      makeProvider('first', first),
      makeProvider('second', second),
    ]);

    const flights = await provider.search(criteria, pagination);
    expect(flights[0].id).toBe('first');
  });
});

describe('AmadeusFlightDataProvider (#779 secondary)', () => {
  const baseOffer: AmadeusFlightData = {
    id: 'offer-1',
    type: 'flight',
    source: { name: 'GDS' },
    instantTicketingRequired: false,
    nonHomogeneous: false,
    oneWay: true,
    lastTicketingDate: '2026-04-01',
    numberOfBookableSeats: 9,
    itineraries: [
      {
        duration: 'PT6H',
        segments: [
          {
            departure: { iataCode: 'JFK', at: '2026-05-01T09:00:00' },
            arrival: { iataCode: 'LAX', at: '2026-05-01T15:00:00' },
            operatingAirline: { carrierCode: 'AA' },
            aircraft: { code: '321' },
            operating: 'AA',
            number: '1234',
            blacklistedInEU: false,
          },
        ],
      },
    ],
    price: { total: '180.00', base: '150.00', fee: '5.00', grandTotal: '185.00', currency: 'USD' },
    pricingOptions: { fareType: ['STANDARD'], includedCheckedBagsOnly: false },
    validatingAirlineCodes: ['AA'],
    travelerPricings: [
      {
        travelerId: '1',
        fareOption: 'STANDARD',
        travelerType: 'ADULT',
        price: { total: '185.00', base: '150.00' },
        fareDetailsBySegment: [
          {
            segmentId: '0',
            cabin: 'ECONOMY',
            fareBasis: 'QLXSAV',
            class: 'Q',
            includedCheckedBags: { weight: 23, weightUnit: 'KG' },
          },
        ],
      },
    ],
  } as unknown as AmadeusFlightData;

  it('maps a direct offer to the shared Flight shape', () => {
    const flight = mapAmadeusOfferToFlight(baseOffer);
    expect(flight).not.toBeNull();
    expect(flight!.id).toBe('amadeus-AA1234-2026-05-01T09:00:00');
    expect(flight!.from).toBe('JFK');
    expect(flight!.to).toBe('LAX');
    expect(flight!.airline).toBe('AA');
    expect(flight!.stops).toBe(0);
    expect(flight!.duration).toBe(360);
    expect(flight!.price).toBeCloseTo(185.0);
    expect(flight!.available_seats).toBe(9);
    expect(flight!.class).toBe('economy');
  });

  it('maps connecting itineraries with stop count and fallback duration', () => {
    const offer = {
      ...baseOffer,
      itineraries: [
        {
          duration: '',
          segments: [
            baseOffer.itineraries[0].segments[0],
            {
              ...baseOffer.itineraries[0].segments[0],
              departure: { iataCode: 'LAX', at: '2026-05-01T18:00:00' },
              arrival: { iataCode: 'SFO', at: '2026-05-01T19:30:00' },
              number: '5678',
            },
          ],
        },
      ],
    } as unknown as AmadeusFlightData;

    const flight = mapAmadeusOfferToFlight(offer);
    expect(flight!.stops).toBe(1);
    expect(flight!.to).toBe('SFO');
    // duration fell back to first-departure → last-arrival wall clock
    expect(flight!.duration).toBe(630);
  });

  it('FAILURE MODE: malformed offers (no segments, bad dates) map to null', () => {
    expect(
      mapAmadeusOfferToFlight({ ...baseOffer, itineraries: [] } as unknown as AmadeusFlightData),
    ).toBeNull();
    const badDate = {
      ...baseOffer,
      itineraries: [
        {
          ...baseOffer.itineraries[0],
          segments: [
            {
              ...baseOffer.itineraries[0].segments[0],
              departure: { ...baseOffer.itineraries[0].segments[0].departure, at: 'not-a-date' },
            },
          ],
        },
      ],
    } as unknown as AmadeusFlightData;
    expect(mapAmadeusOfferToFlight(badDate)).toBeNull();
  });

  it('FAILURE MODE: search without credentials throws', async () => {
    const provider = new AmadeusFlightDataProvider({});
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.search(criteria, pagination)).rejects.toThrow(/not configured/i);
  });

  it('configured provider returns mapped flights through the client', async () => {
    const provider = new AmadeusFlightDataProvider({
      clientId: 'id',
      clientSecret: 'secret',
    });
    expect(provider.isConfigured()).toBe(true);

    const searchFlights = jest.fn().mockResolvedValue([baseOffer]);
    (provider as any).client = { searchFlights };

    const flights = await provider.search(criteria, pagination);
    expect(searchFlights).toHaveBeenCalledWith(
      expect.objectContaining({
        originLocationCode: 'JFK',
        destinationLocationCode: 'LAX',
        departureDate: '2026-05-01',
        adults: 1,
        max: 10,
      }),
    );
    expect(flights).toHaveLength(1);
    expect(flights[0].airline).toBe('AA');
  });

  describe('parseIsoDurationMinutes', () => {
    it('parses hours and minutes', () => {
      expect(parseIsoDurationMinutes('PT2H30M')).toBe(150);
    });
    it('parses days and hours', () => {
      expect(parseIsoDurationMinutes('P1DT2H')).toBe(1560);
    });
    it('returns 0 for unparseable input', () => {
      expect(parseIsoDurationMinutes('garbage')).toBe(0);
      expect(parseIsoDurationMinutes('')).toBe(0);
    });
  });
});
