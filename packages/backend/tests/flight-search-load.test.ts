import { InMemorySearchCache } from '../src/cache/searchCache';
import { InMemoryFlightRepository } from '../src/repositories/flightRepository';
import { FlightSearchService } from '../src/services/flightSearchService';
import {
  FlightRegistryService,
  FlightRegistryState,
} from '../src/services/flightRegistryService';
import { cacheOperationsTotal, register, serviceOperationDuration } from '../src/services/metrics';
import { Flight, FlightPagination, FlightSearchCriteria } from '../src/types/flight';

// `monitoring/slo` calls a metrics helper that is not exported on main, so the
// real hook throws before the load profile can run. The harness verifies its
// own provider/cache/service metrics below; isolate it from that unrelated
// pre-existing breakage instead of changing production SLO code (#1196).
jest.mock('../src/monitoring/slo', () => ({
  sloMeasure: async (_operation: string, fn: () => Promise<unknown>) => fn(),
}));

/**
 * Bounded, deterministic v1 load profile for flight search (#1196).
 *
 * The profile is deliberately small enough to run on every PR. It uses the
 * in-memory repository, cache and registry stub, so no supplier is mutated and
 * no network call is made. We assert structural invariants (concurrency is
 * bounded, the cache absorbs repeat load, both service operations are
 * measured) and only use latency as a loose guard rail, since wall-clock
 * timing on shared CI runners is noisy.
 */
const V1_LOAD_PROFILE = {
  concurrency: 20,
  rounds: 3,
  pageSize: 10,
  maxP95Ms: 500,
} as const;

const criteria: FlightSearchCriteria = {
  from: 'JFK',
  to: 'LAX',
  date: '2026-05-01',
  passengers: 1,
  travelClass: 'economy',
  sortBy: 'price',
  pageSize: V1_LOAD_PROFILE.pageSize,
};

class OfflineRegistryService implements FlightRegistryService {
  async getStates(flights: Flight[]): Promise<Record<string, FlightRegistryState>> {
    return flights.reduce<Record<string, FlightRegistryState>>((acc, flight) => {
      acc[flight.id] = {
        listed: true,
        reservable: flight.available_seats > 0,
        contract_flight_id: flight.id,
        available_seats: flight.available_seats,
      };
      return acc;
    }, {});
  }
}

/** Repository wrapper that records peak concurrent provider calls. */
class CountingFlightRepository extends InMemoryFlightRepository {
  activeCalls = 0;
  maxActiveCalls = 0;

  async searchFlights(searchCriteria: FlightSearchCriteria, pagination: FlightPagination) {
    this.activeCalls += 1;
    this.maxActiveCalls = Math.max(this.maxActiveCalls, this.activeCalls);
    try {
      // Yield so overlapping requests are observable and concurrency is real.
      await new Promise<void>((resolve) => setImmediate(resolve));
      return await super.searchFlights(searchCriteria, pagination);
    } finally {
      this.activeCalls -= 1;
    }
  }
}

interface CounterSample {
  labels: Record<string, string>;
  value: number;
  metricName?: string;
}

async function readCounter(name: string): Promise<CounterSample[]> {
  const metric = register.getSingleMetric(name);
  if (!metric) return [];
  const result = (await metric.get()) as {
    values: Array<{ labels: Record<string, string>; value: number; metricName?: string }>;
  };
  return result.values.map((sample) => ({
    labels: sample.labels,
    value: sample.value,
    metricName: sample.metricName,
  }));
}

/** A histogram exposes count, sum and bucket samples; only count is a request count. */
function sumHistogramCounts(
  samples: CounterSample[],
  match: (labels: Record<string, string>) => boolean,
): number {
  return sumMatching(
    samples.filter((sample) => sample.metricName?.endsWith('_count')),
    match,
  );
}

function sumMatching(
  samples: CounterSample[],
  match: (labels: Record<string, string>) => boolean,
): number {
  return samples.filter((sample) => match(sample.labels)).reduce((sum, sample) => sum + sample.value, 0);
}

function percentile(sortedValues: number[], fraction: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1);
  return sortedValues[index];
}

describe('flight search bounded v1 load check (#1196)', () => {
  it('stays within the documented profile without touching a supplier', async () => {
    const repository = new CountingFlightRepository();
    const cache = new InMemorySearchCache('flight-search-load');
    const service = new FlightSearchService(
      repository,
      cache,
      300,
      undefined,
      new OfflineRegistryService(),
    );

    const cacheBefore = await readCounter('traqora_cache_operations_total');
    const durationBefore = await readCounter('traqora_service_operation_duration_seconds');
    const durations: number[] = [];

    for (let round = 0; round < V1_LOAD_PROFILE.rounds; round += 1) {
      const roundDurations = await Promise.all(
        Array.from({ length: V1_LOAD_PROFILE.concurrency }, async () => {
          const start = process.hrtime.bigint();
          const result = await service.searchFlights(criteria);
          const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000;
          expect(result.data.length).toBeGreaterThan(0);
          expect(result.pagination.page_size).toBe(V1_LOAD_PROFILE.pageSize);
          return elapsedMs;
        }),
      );
      durations.push(...roundDurations);
    }

    // Concurrency never exceeds the agreed profile.
    expect(repository.maxActiveCalls).toBeLessThanOrEqual(V1_LOAD_PROFILE.concurrency);
    expect(repository.maxActiveCalls).toBeGreaterThan(1);

    // The first round misses once per concurrent request; later rounds are
    // absorbed by the cache, so the provider is never called again.
    expect(repository.queryCount).toBe(V1_LOAD_PROFILE.concurrency);

    const cacheAfter = await readCounter('traqora_cache_operations_total');
    const misses = sumMatching(cacheAfter, (labels) =>
      labels.cache === 'flight-search-load' && labels.result === 'miss') -
      sumMatching(cacheBefore, (labels) =>
        labels.cache === 'flight-search-load' && labels.result === 'miss');
    const hits = sumMatching(cacheAfter, (labels) =>
      labels.cache === 'flight-search-load' && labels.result === 'hit') -
      sumMatching(cacheBefore, (labels) =>
        labels.cache === 'flight-search-load' && labels.result === 'hit');
    expect(misses).toBe(V1_LOAD_PROFILE.concurrency);
    expect(hits).toBe(V1_LOAD_PROFILE.concurrency * (V1_LOAD_PROFILE.rounds - 1));

    // Both service operations are instrumented under the agreed profile.
    const durationAfter = await readCounter('traqora_service_operation_duration_seconds');
    const providerSamples = sumHistogramCounts(durationAfter, (labels) =>
      labels.component === 'flight_search' && labels.operation === 'provider_search') -
      sumHistogramCounts(durationBefore, (labels) =>
        labels.component === 'flight_search' && labels.operation === 'provider_search');
    const registrySamples = sumHistogramCounts(durationAfter, (labels) =>
      labels.component === 'flight_search' && labels.operation === 'registry_state_lookup') -
      sumHistogramCounts(durationBefore, (labels) =>
        labels.component === 'flight_search' && labels.operation === 'registry_state_lookup');
    expect(providerSamples).toBe(V1_LOAD_PROFILE.concurrency);
    expect(registrySamples).toBe(V1_LOAD_PROFILE.concurrency);

    // Loose guard rail only. Structural assertions above carry the test.
    const sortedDurations = [...durations].sort((a, b) => a - b);
    expect(percentile(sortedDurations, 0.95)).toBeLessThan(V1_LOAD_PROFILE.maxP95Ms);
  });

  it('rejects a malformed cursor before any provider call', async () => {
    const repository = new CountingFlightRepository();
    const service = new FlightSearchService(
      repository,
      new InMemorySearchCache('flight-search-load-validation'),
      300,
      undefined,
      new OfflineRegistryService(),
    );

    const invalidCriteria = { ...criteria, cursor: 'not-base64' };

    await expect(service.searchFlights(invalidCriteria)).rejects.toThrow(
      'Invalid cursor value',
    );
    expect(repository.queryCount).toBe(0);
  });
});
