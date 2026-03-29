import { createSearchCache, SearchCache } from '../cache/searchCache';
import { config } from '../config';
import { getPostgresPool } from '../db/postgres';
import {
  FlightRepository,
  InMemoryFlightRepository,
  PostgresFlightRepository,
} from '../repositories/flightRepository';
import {
  EnrichedFlight,
  FlightSearchCriteria,
  FlightSearchResponse,
  SortOrder,
} from '../types/flight';
import {
  OffchainFlightDataProvider,
  RepositoryOffchainFlightDataProvider,
} from './offchainFlightDataProvider';
import { createFlightRegistryService, FlightRegistryService } from './flightRegistryService';

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

const toXlm = (usdPrice: number, xlmUsdRate: number): number => {
  if (xlmUsdRate <= 0) {
    return 0;
  }

  return Number((usdPrice / xlmUsdRate).toFixed(2));
};

export class FlightSearchService {
  private readonly provider: OffchainFlightDataProvider;
  private readonly registryService: FlightRegistryService;
  private readonly cache: SearchCache;
  private readonly cacheTtlSeconds: number;
  private readonly xlmUsdRate: number;

  constructor(
    repository: FlightRepository,
    cache: SearchCache,
    cacheTtlSeconds = 300,
    provider?: OffchainFlightDataProvider,
    registryService?: FlightRegistryService,
    xlmUsdRate = Number.parseFloat(process.env.XLM_USD_RATE || '0.12')
  ) {
    this.provider = provider || new RepositoryOffchainFlightDataProvider(repository);
    this.registryService = registryService || createFlightRegistryService();
    this.cache = cache;
    this.cacheTtlSeconds = cacheTtlSeconds;
    this.xlmUsdRate = xlmUsdRate;
  }

  async searchFlights(criteria: FlightSearchCriteria): Promise<FlightSearchResponse> {
    const normalizedCriteria = normalizeSearchCriteria(criteria);
    const cacheKey = buildCacheKey(normalizedCriteria);

    const cached = await this.cache.get<FlightSearchResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const { offset } = decodeCursor(normalizedCriteria.cursor);

    const flights = await this.provider.search(normalizedCriteria, {
      limit: normalizedCriteria.pageSize + 1,
      offset,
    });

    const hasMore = flights.length > normalizedCriteria.pageSize;
    const pageFlights = hasMore ? flights.slice(0, normalizedCriteria.pageSize) : flights;

    const onChainStates = await this.registryService.getStates(pageFlights);
    const enrichedFlights: EnrichedFlight[] = pageFlights.reduce<EnrichedFlight[]>((acc, flight) => {
      const state = onChainStates[flight.id];
      if (!state?.listed || !state.reservable || state.available_seats < normalizedCriteria.passengers) {
        return acc;
      }

      acc.push({
        ...flight,
        pricing: {
          usd: flight.price,
          xlm: toXlm(flight.price, this.xlmUsdRate),
          xlm_usd_rate: this.xlmUsdRate,
        },
        on_chain: {
          listed: state.listed,
          reservable: state.reservable,
          contract_flight_id: state.contract_flight_id,
          available_seats: state.available_seats,
        },
      });

      return acc;
    }, []);

    const response: FlightSearchResponse = {
      data: enrichedFlights,
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
