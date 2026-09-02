import { buildRealisticFlightFixtures, buildRouteFareMatrix } from './realisticFlightFixtures';
import { MockFactories } from './mockFactories';

describe('realistic flight fixtures', () => {
  it('provides realistic cross-region routes with fares and schedules', () => {
    const fixtures = buildRealisticFlightFixtures(new Date('2026-08-29T00:00:00.000Z'));

    expect(fixtures).toHaveLength(4);
    expect(fixtures.map((fixture) => fixture.routeCode)).toEqual([
      'JFK-LHR',
      'LOS-DXB',
      'GRU-MIA',
      'CPT-NBO',
    ]);
    expect(fixtures.every((fixture) => fixture.priceCents > 0)).toBe(true);
    expect(fixtures.every((fixture) => fixture.arrivalTime > fixture.departureTime)).toBe(true);
  });

  it('builds a fare matrix service tests can reuse without hand-rolled data', () => {
    const fares = buildRouteFareMatrix();

    expect(fares).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ routeCode: 'LOS-DXB', fareClass: 'premium_economy' }),
        expect.objectContaining({ routeCode: 'GRU-MIA', fareClass: 'business' }),
      ])
    );
  });

  it('exposes realistic flight entities through MockFactories', () => {
    const flights = MockFactories.createRealisticFlights();

    expect(flights[0].flightNumber).toBe('TQ101');
    expect(flights[1].fromAirport).toBe('LOS');
    expect(flights.every((flight) => flight.seatsAvailable > 0)).toBe(true);
  });
});