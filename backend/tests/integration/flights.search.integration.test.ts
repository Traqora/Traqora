import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app';
import { InMemorySearchCache } from '../../src/cache/searchCache';
import { InMemoryFlightRepository } from '../../src/repositories/flightRepository';
import { FlightSearchService } from '../../src/services/flightSearchService';
import { Flight } from '../../src/types/flight';

const seedFlights: Flight[] = [
  {
    id: 'TST-001',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T09:00:00.000Z',
    airline: 'AA',
    stops: 0,
    duration: 360,
    price: 220,
    rating: 4.6,
    available_seats: 8,
    class: 'economy',
  },
  {
    id: 'TST-002',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T10:30:00.000Z',
    airline: 'DL',
    stops: 1,
    duration: 420,
    price: 180,
    rating: 4.1,
    available_seats: 6,
    class: 'economy',
  },
  {
    id: 'TST-003',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T12:00:00.000Z',
    airline: 'UA',
    stops: 0,
    duration: 340,
    price: 300,
    rating: 4.8,
    available_seats: 4,
    class: 'economy',
  },
  {
    id: 'TST-004',
    from: 'JFK',
    to: 'LAX',
    date: '2026-05-01',
    departure_time: '2026-05-01T15:00:00.000Z',
    airline: 'AA',
    stops: 0,
    duration: 345,
    price: 520,
    rating: 4.9,
    available_seats: 2,
    class: 'business',
  },
  {
    id: 'TST-005',
    from: 'JFK',
    to: 'SFO',
    date: '2026-05-01',
    departure_time: '2026-05-01T08:00:00.000Z',
    airline: 'B6',
    stops: 1,
    duration: 410,
    price: 200,
    rating: 4.0,
    available_seats: 10,
    class: 'economy',
  },
];

const baseQuery = {
  from: 'JFK',
  to: 'LAX',
  date: '2026-05-01',
  passengers: '2',
  class: 'economy',
};

const buildTestContext = (searchPoints = 100) => {
  const repository = new InMemoryFlightRepository(seedFlights);
  const cache = new InMemorySearchCache();
  const service = new FlightSearchService(repository, cache, 300);

  const app = createApp({
    flightSearchService: service,
    globalRateLimit: false,
    searchRateLimit: {
      points: searchPoints,
      durationSeconds: 60,
    },
  });

  return { app, repository };
};

describe('GET /api/v1/flights/search', () => {
  it('returns filtered and sorted results', async () => {
    const { app } = buildTestContext();

    const response = await request(app).get('/api/v1/flights/search').query({
      ...baseQuery,
      price_min: '200',
      price_max: '320',
      stops: '0',
      sort: 'price',
      sort_order: 'asc',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].id).toBe('TST-001');
    expect(response.body.data[1].id).toBe('TST-003');
  });

  it('supports cursor-based pagination', async () => {
    const { app } = buildTestContext();

    const firstPage = await request(app).get('/api/v1/flights/search').query({
      ...baseQuery,
      sort: 'departure_time',
      sort_order: 'asc',
      page_size: '1',
    });

    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data[0].id).toBe('TST-001');
    expect(firstPage.body.pagination.has_more).toBe(true);
    expect(firstPage.body.pagination.next_cursor).toBeTruthy();

    const secondPage = await request(app).get('/api/v1/flights/search').query({
      ...baseQuery,
      sort: 'departure_time',
      sort_order: 'asc',
      page_size: '1',
      cursor: firstPage.body.pagination.next_cursor,
    });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data[0].id).toBe('TST-002');
  });

  it('uses cache for identical queries', async () => {
    const { app, repository } = buildTestContext();

    await request(app).get('/api/v1/flights/search').query(baseQuery);
    await request(app).get('/api/v1/flights/search').query(baseQuery);

    expect(repository.queryCount).toBe(1);
  });

  it('enforces 100 req/min per IP rate limit policy', async () => {
    const { app } = buildTestContext(2);

    const first = await request(app).get('/api/v1/flights/search').query(baseQuery);
    const second = await request(app).get('/api/v1/flights/search').query(baseQuery);
    const third = await request(app).get('/api/v1/flights/search').query(baseQuery);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('returns 400 for invalid query params', async () => {
    const { app } = buildTestContext();

    const response = await request(app).get('/api/v1/flights/search').query({
      from: 'JFK',
      to: 'LAX',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
