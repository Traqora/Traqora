import { createSearchCache, SearchCache } from '../cache/searchCache';
import { config } from '../config';
import { getPostgresPool } from '../db/postgres';
import {
  FlightRepository,
  InMemoryFlightRepository,
  PostgresFlightRepository,
} from '../repositories/flightRepository';
import { FlightSearchCriteria, FlightSearchResponse, SortOrder } from '../types/flight';

interface CursorPayload {
  offset: number;
}

const defaultSortOrder = (sortBy: FlightSearchCriteria['sortBy']): SortOrder => {
  return sortBy === 'rating' ? 'desc' : 'asc';
};

const encodeCursor = (payload: CursorPayload): string => {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
};

const decodeCursor = (cursor?: string): CursorPayload => {
  if (!cursor) {
    return { offset: 0 };
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as CursorPayload;

    if (typeof parsed.offset !== 'number' || parsed.offset < 0) {
      throw new Error('Invalid cursor offset');
    }

    return parsed;
  } catch (_error) {
    throw new Error('Invalid cursor value');
  }
};

const normalizeSearchCriteria = (criteria: FlightSearchCriteria): FlightSearchCriteria => {
  return {
    ...criteria,
    sortOrder: criteria.sortOrder || defaultSortOrder(criteria.sortBy),
    airlines: criteria.airlines?.map((airline) => airline.trim()).filter(Boolean),
  };
};

const buildCacheKey = (criteria: FlightSearchCriteria): string => {
  return `flight-search:${Buffer.from(JSON.stringify(criteria), 'utf8').toString('base64url')}`;
};

export class FlightSearchService {
  private readonly repository: FlightRepository;
  private readonly cache: SearchCache;
  private readonly cacheTtlSeconds: number;

  constructor(repository: FlightRepository, cache: SearchCache, cacheTtlSeconds = 300) {
    this.repository = repository;
    this.cache = cache;
    this.cacheTtlSeconds = cacheTtlSeconds;
  }

  async searchFlights(criteria: FlightSearchCriteria): Promise<FlightSearchResponse> {
    const normalizedCriteria = normalizeSearchCriteria(criteria);
    const cacheKey = buildCacheKey(normalizedCriteria);

    const cached = await this.cache.get<FlightSearchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const { offset } = decodeCursor(normalizedCriteria.cursor);

    const flights = await this.repository.searchFlights(normalizedCriteria, {
      limit: normalizedCriteria.pageSize + 1,
      offset,
    });

    const hasMore = flights.length > normalizedCriteria.pageSize;
    const data = hasMore ? flights.slice(0, normalizedCriteria.pageSize) : flights;

    const response: FlightSearchResponse = {
      data,
      pagination: {
        next_cursor: hasMore
          ? encodeCursor({ offset: offset + normalizedCriteria.pageSize })
          : null,
        has_more: hasMore,
        page_size: normalizedCriteria.pageSize,
      },
    };

    await this.cache.set(cacheKey, response, this.cacheTtlSeconds);

    return response;
  }
}

export const createDefaultFlightSearchService = (): FlightSearchService => {
  const repository: FlightRepository = config.databaseUrl
    ? new PostgresFlightRepository(getPostgresPool())
    : new InMemoryFlightRepository();

  const cache = createSearchCache(config.redisUrl || undefined);

  return new FlightSearchService(repository, cache, config.flightSearchCacheTtlSeconds);
};