import { Pool } from 'pg';
import {
  CabinClass,
  Flight,
  FlightPagination,
  FlightSearchCriteria,
  FlightSortBy,
  SortOrder,
} from '../types/flight';

export interface FlightRepository {
  searchFlights(criteria: FlightSearchCriteria, pagination: FlightPagination): Promise<Flight[]>;
}

interface FlightRow {
  id: string;
  origin: string;
  destination: string;
  departure_date: string | Date;
  departure_time: string | Date;
  airline_code: string;
  stops: number;
  duration_minutes: number;
  price: number;
  rating: number;
  available_seats: number;
  cabin_class: CabinClass;
}

const defaultFlights: Flight[] = [
  {
    id: 'FL-1001',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T09:00:00.000Z',
    airline: 'AA',
    stops: 0,
    duration: 360,
    price: 220,
    rating: 4.6,
    available_seats: 7,
    class: 'economy',
  },
  {
    id: 'FL-1002',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T11:00:00.000Z',
    airline: 'DL',
    stops: 1,
    duration: 420,
    price: 180,
    rating: 4.2,
    available_seats: 10,
    class: 'economy',
  },
  {
    id: 'FL-1003',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T13:00:00.000Z',
    airline: 'UA',
    stops: 0,
    duration: 340,
    price: 310,
    rating: 4.8,
    available_seats: 4,
    class: 'economy',
  },
  {
    id: 'FL-1004',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T15:30:00.000Z',
    airline: 'AA',
    stops: 0,
    duration: 345,
    price: 520,
    rating: 4.9,
    available_seats: 2,
    class: 'business',
  },
  {
    id: 'FL-1005',
    from: 'JFK',
    to: 'SFO',
    date: '2026-05-01',
    departure_time: '2026-05-01T08:00:00.000Z',
    airline: 'B6',
    stops: 1,
    duration: 410,
    price: 200,
    rating: 4.0,
    available_seats: 12,
    class: 'economy',
  },
];

const sortOrderDefault = (sortBy: FlightSortBy): SortOrder => {
  return sortBy === 'rating' ? 'desc' : 'asc';
};

const normalizeDateValue = (dateValue: string | Date): string => {
  if (dateValue instanceof Date) {
    return dateValue.toISOString().slice(0, 10);
  }

  return dateValue.slice(0, 10);
};

const normalizeTimestamp = (timestamp: string | Date): string => {
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  return new Date(timestamp).toISOString();
};

const compareFlights = (a: Flight, b: Flight, sortBy: FlightSortBy, sortOrder: SortOrder): number => {
  const direction = sortOrder === 'asc' ? 1 : -1;

  let left = 0;
  let right = 0;

  switch (sortBy) {
    case 'price':
      left = a.price;
      right = b.price;
      break;
    case 'duration':
      left = a.duration;
      right = b.duration;
      break;
    case 'departure_time':
      left = new Date(a.departure_time).getTime();
      right = new Date(b.departure_time).getTime();
      break;
    case 'rating':
      left = a.rating;
      right = b.rating;
      break;
    default:
      left = a.price;
      right = b.price;
      break;
  }

  if (left === right) {
    return a.id.localeCompare(b.id);
  }

  return (left - right) * direction;
};

export class PostgresFlightRepository implements FlightRepository {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async searchFlights(criteria: FlightSearchCriteria, pagination: FlightPagination): Promise<Flight[]> {
    const values: Array<string | number | string[]> = [];
    const whereClauses: string[] = [];
    let index = 1;

    whereClauses.push(`LOWER(origin) = LOWER($${index})`);
    values.push(criteria.from);
    index += 1;

    whereClauses.push(`LOWER(destination) = LOWER($${index})`);
    values.push(criteria.to);
    index += 1;

    whereClauses.push(`departure_date = $${index}`);
    values.push(criteria.date);
    index += 1;

    whereClauses.push(`available_seats >= $${index}`);
    values.push(criteria.passengers);
    index += 1;

    whereClauses.push(`LOWER(cabin_class) = LOWER($${index})`);
    values.push(criteria.travelClass);
    index += 1;

    if (criteria.priceMin !== undefined) {
      whereClauses.push(`price >= $${index}`);
      values.push(criteria.priceMin);
      index += 1;
    }

    if (criteria.priceMax !== undefined) {
      whereClauses.push(`price <= $${index}`);
      values.push(criteria.priceMax);
      index += 1;
    }

    if (criteria.airlines && criteria.airlines.length > 0) {
      whereClauses.push(`LOWER(airline_code) = ANY($${index}::text[])`);
      values.push(criteria.airlines.map((airline) => airline.toLowerCase()));
      index += 1;
    }

    if (criteria.stops !== undefined) {
      whereClauses.push(`stops = $${index}`);
      values.push(criteria.stops);
      index += 1;
    }

    if (criteria.durationMax !== undefined) {
      whereClauses.push(`duration_minutes <= $${index}`);
      values.push(criteria.durationMax);
      index += 1;
    }

    const sortColumnMap: Record<FlightSortBy, string> = {
      price: 'price',
      duration: 'duration_minutes',
      departure_time: 'departure_time',
      rating: 'rating',
    };

    const sortColumn = sortColumnMap[criteria.sortBy];
    const sortOrder = (criteria.sortOrder || sortOrderDefault(criteria.sortBy)).toUpperCase() as 'ASC' | 'DESC';

    const limitPlaceholder = `$${index}`;
    values.push(pagination.limit);
    index += 1;

    const offsetPlaceholder = `$${index}`;
    values.push(pagination.offset);

    const queryText = `
      SELECT
        id,
        origin,
        destination,
        departure_date,
        departure_time,
        airline_code,
        stops,
        duration_minutes,
        price,
        rating,
        available_seats,
        cabin_class
      FROM flights
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY ${sortColumn} ${sortOrder}, id ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `;

    const result = await this.pool.query<FlightRow>(queryText, values);

    return result.rows.map((row) => ({
      id: row.id,
      from: row.origin,
      to: row.destination,
      date: normalizeDateValue(row.departure_date),
      departure_time: normalizeTimestamp(row.departure_time),
      airline: row.airline_code,
      stops: row.stops,
      duration: row.duration_minutes,
      price: Number(row.price),
      rating: Number(row.rating),
      available_seats: row.available_seats,
      class: row.cabin_class,
    }));
  }
}

export class InMemoryFlightRepository implements FlightRepository {
  private readonly flights: Flight[];
  public queryCount = 0;

  constructor(flights: Flight[] = defaultFlights) {
    this.flights = flights;
  }

  async searchFlights(criteria: FlightSearchCriteria, pagination: FlightPagination): Promise<Flight[]> {
    this.queryCount += 1;

    const sortOrder = criteria.sortOrder || sortOrderDefault(criteria.sortBy);
    const normalizedAirlines = (criteria.airlines || []).map((airline) => airline.toLowerCase());

    const filtered = this.flights
      .filter((flight) => flight.from.toLowerCase() === criteria.from.toLowerCase())
      .filter((flight) => flight.to.toLowerCase() === criteria.to.toLowerCase())
      .filter((flight) => flight.date === criteria.date)
      .filter((flight) => flight.available_seats >= criteria.passengers)
      .filter((flight) => flight.class === criteria.travelClass)
      .filter((flight) => criteria.priceMin === undefined || flight.price >= criteria.priceMin)
      .filter((flight) => criteria.priceMax === undefined || flight.price <= criteria.priceMax)
      .filter(
        (flight) =>
          normalizedAirlines.length === 0 || normalizedAirlines.includes(flight.airline.toLowerCase())
      )
      .filter((flight) => criteria.stops === undefined || flight.stops === criteria.stops)
      .filter((flight) => criteria.durationMax === undefined || flight.duration <= criteria.durationMax)
      .sort((left, right) => compareFlights(left, right, criteria.sortBy, sortOrder));

    return filtered.slice(pagination.offset, pagination.offset + pagination.limit);
  }
}