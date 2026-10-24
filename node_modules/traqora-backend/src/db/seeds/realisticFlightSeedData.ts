export interface RealisticFlightSeed {
  flightNumber: string;
  airlineCode: string;
  airlineName: string;
  fromAirport: string;
  fromCity: string;
  toAirport: string;
  toCity: string;
  departureOffsetHours: number;
  arrivalOffsetHours: number;
  seatsAvailable: number;
  priceCents: number;
  fareClass: 'economy' | 'premium_economy' | 'business';
  checkedBagsIncluded: number;
}

export const REALISTIC_FLIGHT_SEED_DATA: RealisticFlightSeed[] = [
  {
    flightNumber: 'TQ101',
    airlineCode: 'TQ',
    airlineName: 'Traqora Airways',
    fromAirport: 'JFK',
    fromCity: 'New York',
    toAirport: 'LHR',
    toCity: 'London',
    departureOffsetHours: 24,
    arrivalOffsetHours: 31,
    seatsAvailable: 148,
    priceCents: 45250,
    fareClass: 'economy',
    checkedBagsIncluded: 1,
  },
  {
    flightNumber: 'SA214',
    airlineCode: 'SA',
    airlineName: 'SkyAnchor',
    fromAirport: 'LOS',
    fromCity: 'Lagos',
    toAirport: 'DXB',
    toCity: 'Dubai',
    departureOffsetHours: 36,
    arrivalOffsetHours: 44,
    seatsAvailable: 93,
    priceCents: 68900,
    fareClass: 'premium_economy',
    checkedBagsIncluded: 2,
  },
  {
    flightNumber: 'VL908',
    airlineCode: 'VL',
    airlineName: 'Vela Link',
    fromAirport: 'GRU',
    fromCity: 'Sao Paulo',
    toAirport: 'MIA',
    toCity: 'Miami',
    departureOffsetHours: 52,
    arrivalOffsetHours: 61,
    seatsAvailable: 37,
    priceCents: 73400,
    fareClass: 'business',
    checkedBagsIncluded: 2,
  },
  {
    flightNumber: 'AK330',
    airlineCode: 'AK',
    airlineName: 'Akwa Connect',
    fromAirport: 'CPT',
    fromCity: 'Cape Town',
    toAirport: 'NBO',
    toCity: 'Nairobi',
    departureOffsetHours: 68,
    arrivalOffsetHours: 74,
    seatsAvailable: 124,
    priceCents: 38600,
    fareClass: 'economy',
    checkedBagsIncluded: 1,
  },
];