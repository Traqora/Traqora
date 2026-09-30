import { REALISTIC_FLIGHT_SEED_DATA } from '../db/seeds/realisticFlightSeedData';

export interface RealisticFlightFixture {
  id: string;
  flightNumber: string;
  airlineCode: string;
  airlineName: string;
  fromAirport: string;
  fromCity: string;
  toAirport: string;
  toCity: string;
  routeCode: string;
  departureTime: Date;
  arrivalTime: Date;
  priceCents: number;
  seatsAvailable: number;
  fareClass: string;
  checkedBagsIncluded: number;
  status: string;
  gate: string;
  terminal: string;
}

export function buildRealisticFlightFixtures(referenceDate = new Date('2026-08-29T00:00:00.000Z')): RealisticFlightFixture[] {
  return REALISTIC_FLIGHT_SEED_DATA.map((seed, index) => ({
    id: `fixture-flight-${String(index + 1).padStart(2, '0')}`,
    ...seed,
    routeCode: `${seed.fromAirport}-${seed.toAirport}`,
    departureTime: new Date(referenceDate.getTime() + seed.departureOffsetHours * 60 * 60 * 1000),
    arrivalTime: new Date(referenceDate.getTime() + seed.arrivalOffsetHours * 60 * 60 * 1000),
    status: 'SCHEDULED',
    gate: ['B12', 'C04', 'A18', 'D07'][index] ?? 'A01',
    terminal: ['T4', 'T2', 'T3', 'T1'][index] ?? 'T1',
  }));
}

export function buildRouteFareMatrix(referenceDate = new Date('2026-08-29T00:00:00.000Z')) {
  return buildRealisticFlightFixtures(referenceDate).map((flight) => ({
    routeCode: flight.routeCode,
    airlineCode: flight.airlineCode,
    fareClass: flight.fareClass,
    priceCents: flight.priceCents,
    seatsAvailable: flight.seatsAvailable,
  }));
}