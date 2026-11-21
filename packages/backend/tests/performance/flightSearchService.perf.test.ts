/**
 * Performance regression tests for FlightSearchService.
 * Measures search operations: basic search, filtered search, pagination.
 */

import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('../../src/cache/searchCache', () => ({
  createSearchCache: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }),
  getFlightSearchCache: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('../../src/db/postgres', () => ({
  getPostgresPool: jest.fn().mockReturnValue({ query: jest.fn().mockResolvedValue({ rows: [] }) }),
}));

jest.mock('../../src/repositories/flightRepository', () => {
  const mockFlight = {
    id: 'FL001',
    flightNumber: 'AA100',
    airline: 'AA',
    departure: { airport: 'JFK', time: '2026-08-01T08:00:00Z' },
    arrival: { airport: 'LHR', time: '2026-08-01T20:00:00Z' },
    duration: 480,
    stops: 0,
    priceCents: 50000,
    cabinClass: 'economy',
    seatsAvailable: 50,
    rating: 4.2,
  };

  const mockFlights = Array.from({ length: 50 }, (_, i) => ({
    ...mockFlight,
    id: `FL${String(i + 1).padStart(3, '0')}`,
    flightNumber: `${['AA', 'DL', 'UA', 'BA', 'LH'][i % 5]}${100 + i}`,
    priceCents: 30000 + i * 1000,
    seatsAvailable: 10 + (i % 40),
    price: (30000 + i * 1000) / 100,
  }));

  return {
    InMemoryFlightRepository: jest.fn().mockImplementation(() => ({
      search: jest.fn().mockImplementation((criteria: any) => {
        let results = [...mockFlights];
        if (criteria.airlines?.length) {
          results = results.filter((f: any) => criteria.airlines.includes(f.airline));
        }
        if (criteria.maxPrice) {
          results = results.filter((f: any) => f.priceCents <= criteria.maxPrice);
        }
        if (criteria.maxStops !== undefined) {
          results = results.filter((f: any) => f.stops <= criteria.maxStops);
        }
        const offset = criteria.cursor ? JSON.parse(Buffer.from(criteria.cursor, 'base64url').toString()).offset : 0;
        const limit = criteria.pageSize || criteria.limit || 25;
        const page = results.slice(offset, offset + limit);
        return {
          flights: page,
          total: results.length,
          hasMore: offset + limit < results.length,
          nextCursor: offset + limit < results.length
            ? Buffer.from(JSON.stringify({ offset: offset + limit })).toString('base64url')
            : null,
        };
      }),
    })),
    PostgresFlightRepository: jest.fn(),
    FlightRepository: jest.fn(),
  };
});

jest.mock('../../src/services/offchainFlightDataProvider', () => ({
  RepositoryOffchainFlightDataProvider: jest.fn().mockImplementation(() => ({
    search: jest.fn().mockImplementation((criteria: any) => {
      const mockFlight = {
        id: 'FL001',
        flightNumber: 'AA100',
        airline: 'AA',
        departure: { airport: 'JFK', time: '2026-08-01T08:00:00Z' },
        arrival: { airport: 'LHR', time: '2026-08-01T20:00:00Z' },
        duration: 480,
        stops: 0,
        priceCents: 50000,
        cabinClass: 'economy',
        seatsAvailable: 50,
        rating: 4.2,
        price: 500,
      };

      const mockFlights = Array.from({ length: 50 }, (_, i) => ({
        ...mockFlight,
        id: `FL${String(i + 1).padStart(3, '0')}`,
        flightNumber: `${['AA', 'DL', 'UA', 'BA', 'LH'][i % 5]}${100 + i}`,
        priceCents: 30000 + i * 1000,
        seatsAvailable: 10 + (i % 40),
        price: (30000 + i * 1000) / 100,
      }));

      let results = [...mockFlights];
      if (criteria.airlines?.length) {
        results = results.filter((f: any) => criteria.airlines.includes(f.airline));
      }
      if (criteria.maxPrice) {
        results = results.filter((f: any) => f.priceCents <= criteria.maxPrice);
      }
      if (criteria.maxStops !== undefined) {
        results = results.filter((f: any) => f.stops <= criteria.maxStops);
      }
      const offset = criteria.offset || 0;
      const limit = criteria.limit || 25;
      return results.slice(offset, offset + limit);
    }),
  })),
  OffchainFlightDataProvider: jest.fn(),
}));

jest.mock('../../src/services/flightRegistryService', () => ({
  createFlightRegistryService: jest.fn().mockReturnValue({
    registerFlight: jest.fn(),
    getFlight: jest.fn(),
    getStates: jest.fn().mockResolvedValue({}),
  }),
}));

jest.mock('../../src/services/metrics', () => ({
  measureAsync: jest.fn().mockImplementation((category: string, name: string, fn: () => Promise<any>) => fn()),
}));

jest.mock('../../src/config', () => ({
  config: {
    xlmUsdRate: 0.1,
    flightSearchCacheTtlSeconds: 300,
    databaseUrl: null,
  },
}));

jest.mock('../../src/services/cache', () => ({
  buildFlightSearchCacheKey: jest.fn().mockReturnValue('test-cache-key'),
  getFlightSearchCache: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  }),
  getOrSetFlightSearchCache: jest.fn().mockImplementation(async (cache, key, ttl, fn) => fn()),
}));

jest.mock('../../src/monitoring/slo', () => ({
  sloMeasure: jest.fn().mockImplementation((name: string, fn: () => Promise<any>) => fn()),
}));

describe('FlightSearchService Performance', () => {
  let FlightSearchService: any;

  beforeAll(async () => {
    const module = await import('../../src/services/flightSearchService');
    FlightSearchService = module.FlightSearchService;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createTestService = () => {
    const { InMemoryFlightRepository } = require('../../src/repositories/flightRepository');
    const { createSearchCache } = require('../../src/cache/searchCache');
    const repository = new InMemoryFlightRepository();
    const cache = createSearchCache();
    return new FlightSearchService(repository, cache);
  };

  it('should search flights within 50ms (basic search)', async () => {
    const service = createTestService();

    const criteria = {
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-08-01',
      sortBy: 'price' as const,
      pageSize: 25,
    };

    const stats = await measurePerf(() => service.searchFlights(criteria), 25);
    assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
  });

  it('should search with airline filter within 50ms', async () => {
    const service = createTestService();

    const criteria = {
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-08-01',
      airlines: ['AA', 'DL'],
      sortBy: 'price' as const,
      pageSize: 25,
    };

    const stats = await measurePerf(() => service.searchFlights(criteria), 25);
    assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
  });

  it('should paginate results within 30ms', async () => {
    const service = createTestService();

    const criteria = {
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-08-01',
      sortBy: 'price' as const,
      pageSize: 10,
    };

    const first = await service.searchFlights(criteria);
    const criteria2 = { ...criteria, cursor: first.pagination.next_cursor || undefined };

    const stats = await measurePerf(() => service.searchFlights(criteria2), 25);
    assertPerfThresholds(stats, { meanMaxMs: 30, maxMs: 60 });
  });

  it('should search with multiple filters within 60ms', async () => {
    const service = createTestService();

    const criteria = {
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-08-01',
      airlines: ['AA', 'DL', 'UA'],
      maxPrice: 80000,
      maxStops: 1,
      sortBy: 'departure_time' as const,
      pageSize: 25,
    };

    const stats = await measurePerf(() => service.searchFlights(criteria), 20);
    assertPerfThresholds(stats, { meanMaxMs: 60, maxMs: 120 });
  });

  it('should meet p95 latency budget for basic search (< 80ms)', async () => {
    const service = createTestService();

    const criteria = {
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-08-01',
      sortBy: 'price' as const,
      pageSize: 25,
    };

    const stats = await measurePerf(() => service.searchFlights(criteria), 50);
    assertPerfThresholds(stats, { p95MaxMs: 80, maxMs: 150 });
  });

  it('should meet p95 latency budget for filtered search (< 100ms)', async () => {
    const service = createTestService();

    const criteria = {
      origin: 'JFK',
      destination: 'LHR',
      departureDate: '2026-08-01',
      airlines: ['AA', 'DL'],
      maxPrice: 80000,
      maxStops: 1,
      sortBy: 'price' as const,
      pageSize: 25,
    };

    const stats = await measurePerf(() => service.searchFlights(criteria), 50);
    assertPerfThresholds(stats, { p95MaxMs: 100, maxMs: 200 });
  });
});