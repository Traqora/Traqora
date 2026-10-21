import { InMemorySearchCache } from '../src/cache/searchCache';
import { FailoverFlightDataProvider } from '../src/services/failoverFlightDataProvider';
import { FlightSearchService } from '../src/services/flightSearchService';
import { Flight, FlightSearchCriteria } from '../src/types/flight';
import { FlightRegistryService } from '../src/services/flightRegistryService';
import { FlightRepository } from '../src/repositories/flightRepository';

const criteria: FlightSearchCriteria = {
  from: 'JFK',
  to: 'LAX',
  date: '2026-05-01',
  passengers: 1,
  travelClass: 'economy',
  sortBy: 'price',
  pageSize: 10,
};

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

describe('FlightSearchService provider_results (#913)', () => {
  const registry: FlightRegistryService = {
    async getStates(flights) {
      return Object.fromEntries(
        flights.map((flight) => [
          flight.id,
          {
            listed: true,
            reservable: true,
            contract_flight_id: flight.id,
            available_seats: flight.available_seats,
          },
        ]),
      );
    },
  };

  it('exposes a counts-only partial signal when one upstream provider fails', async () => {
    const provider = new FailoverFlightDataProvider([
      {
        name: 'primary',
        provider: {
          search: jest.fn().mockRejectedValue(new Error('bearer sk_live_secret')),
        },
      },
      {
        name: 'secondary',
        provider: {
          search: jest.fn().mockResolvedValue([makeFlight('kept')]),
        },
      },
    ]);

    const service = new FlightSearchService(
      {} as FlightRepository,
      new InMemorySearchCache('partial-913'),
      30,
      provider,
      registry,
      0.1,
    );

    const response = await service.searchFlights(criteria);
    expect(response.data.map((flight) => flight.id)).toEqual(['kept']);
    expect(response.provider_results).toEqual({ complete: false, succeeded: 1, failed: 1 });
    expect(JSON.stringify(response)).not.toMatch(/sk_live_secret|primary|secondary/);
  });

  it('FAILURE MODE: every provider failing does not return an empty success', async () => {
    const provider = new FailoverFlightDataProvider([
      {
        name: 'primary',
        provider: { search: jest.fn().mockRejectedValue(new Error('down')) },
      },
    ]);
    const service = new FlightSearchService(
      {} as FlightRepository,
      new InMemorySearchCache('partial-913-fail'),
      30,
      provider,
      registry,
      0.1,
    );

    await expect(service.searchFlights(criteria)).rejects.toThrow(/all flight providers failed/i);
  });
});
