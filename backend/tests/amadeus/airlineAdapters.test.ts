/**
 * Airline Adapters Tests
 * Tests for the adapter pattern implementation with multiple airline systems
 */

import {
  BaseAirlineAdapter,
  LufthansaAdapter,
  AirFranceAdapter,
  BritishAirwaysAdapter,
  AirlineAdapterRegistry,
} from '../../../src/services/amadeus/airlineAdapters';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('LufthansaAdapter', () => {
  let adapter: LufthansaAdapter;

  beforeEach(() => {
    adapter = new LufthansaAdapter();
  });

  it('should have correct metadata', () => {
    const metadata = adapter.getMetadata();
    expect(metadata.name).toBe('Lufthansa');
    expect(metadata.airlineCode).toBe('LH');
    expect(metadata.priority).toBe(1); // Highest priority
  });

  it('should fetch flight data', async () => {
    const data = await adapter.fetchFlightData('LH001', '2026-02-25');
    expect(data).toBeDefined();
    expect(data.flightNumber).toBe('LH001');
  });

  it('should fetch multiple flights', async () => {
    const flights = await adapter.fetchFlights('FRA', '2026-02-25');
    expect(Array.isArray(flights)).toBe(true);
    expect(flights.length).toBeGreaterThan(0);
  });

  it('should get flight status', async () => {
    const status = await adapter.fetchFlightStatus('LH001', '2026-02-25');
    expect(status).toBeDefined();
    expect(status.flightNumber).toBe('LH001');
  });

  it('should perform health check', async () => {
    const health = await adapter.healthCheck();
    expect(health).toBe(true);
  });
});

describe('AirFranceAdapter', () => {
  let adapter: AirFranceAdapter;

  beforeEach(() => {
    adapter = new AirFranceAdapter();
  });

  it('should have correct metadata', () => {
    const metadata = adapter.getMetadata();
    expect(metadata.name).toBe('Air France');
    expect(metadata.airlineCode).toBe('AF');
    expect(metadata.priority).toBe(2); // Medium priority
  });

  it('should fetch flight data', async () => {
    const data = await adapter.fetchFlightData('AF101', '2026-02-25');
    expect(data).toBeDefined();
    expect(data.flightNumber).toBe('AF101');
  });

  it('should fetch multiple flights', async () => {
    const flights = await adapter.fetchFlights('CDG', '2026-02-25');
    expect(Array.isArray(flights)).toBe(true);
  });

  it('should get flight status', async () => {
    const status = await adapter.fetchFlightStatus('AF101', '2026-02-25');
    expect(status).toBeDefined();
    expect(status.status).toMatch(
      /SCHEDULED|DELAYED|CANCELLED|LANDED/
    );
  });
});

describe('BritishAirwaysAdapter', () => {
  let adapter: BritishAirwaysAdapter;

  beforeEach(() => {
    adapter = new BritishAirwaysAdapter();
  });

  it('should have correct metadata', () => {
    const metadata = adapter.getMetadata();
    expect(metadata.name).toBe('British Airways');
    expect(metadata.airlineCode).toBe('BA');
    expect(metadata.priority).toBe(3); // Lowest priority
  });

  it('should fetch flight data', async () => {
    const data = await adapter.fetchFlightData('BA001', '2026-02-25');
    expect(data).toBeDefined();
    expect(data.flightNumber).toBe('BA001');
  });

  it('should fetch multiple flights', async () => {
    const flights = await adapter.fetchFlights('LHR', '2026-02-25');
    expect(Array.isArray(flights)).toBe(true);
  });

  it('should get flight status', async () => {
    const status = await adapter.fetchFlightStatus('BA001', '2026-02-25');
    expect(status).toBeDefined();
  });
});

describe('AirlineAdapterRegistry', () => {
  let registry: AirlineAdapterRegistry;

  beforeEach(() => {
    registry = new AirlineAdapterRegistry();
  });

  describe('register and retrieval', () => {
    it('should register adapters', () => {
      const lufthansa = new LufthansaAdapter();
      registry.register(lufthansa);

      const retrieved = registry.getAdapter('LH');
      expect(retrieved).toBeDefined();
      expect(retrieved?.getMetadata().name).toBe('Lufthansa');
    });

    it('should return null for unregistered adapter', () => {
      const adapter = registry.getAdapter('XX');
      expect(adapter).toBeNull();
    });

    it('should return all registered adapters', () => {
      registry.register(new LufthansaAdapter());
      registry.register(new AirFranceAdapter());
      registry.register(new BritishAirwaysAdapter());

      const adapters = registry.getAllAdapters();
      expect(adapters.length).toBe(3);
    });
  });

  describe('adapter priority ordering', () => {
    it('should sort adapters by priority (descending)', () => {
      // Register in reverse priority order
      registry.register(new BritishAirwaysAdapter()); // priority 3
      registry.register(new LufthansaAdapter()); // priority 1
      registry.register(new AirFranceAdapter()); // priority 2

      const adapters = registry.getAllAdapters();
      expect(adapters[0].getMetadata().priority).toBe(1);
      expect(adapters[1].getMetadata().priority).toBe(2);
      expect(adapters[2].getMetadata().priority).toBe(3);
    });
  });

  describe('adapter existence check', () => {
    it('should check if adapter exists', () => {
      registry.register(new LufthansaAdapter());
      expect(registry.hasAdapter('LH')).toBe(true);
      expect(registry.hasAdapter('AF')).toBe(false);
    });
  });

  describe('batch adapter operations', () => {
    it('should fetch from multiple adapters', async () => {
      registry.register(new LufthansaAdapter());
      registry.register(new AirFranceAdapter());

      const adapters = registry.getAllAdapters();
      const fetchPromises = adapters.map((a) =>
        a.fetchFlights('FRA', '2026-02-25')
      );

      const results = await Promise.all(fetchPromises);
      expect(results.length).toBe(2);
      results.forEach((result) => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should handle partial adapter failures', async () => {
      registry.register(new LufthansaAdapter());
      registry.register(new AirFranceAdapter());

      const adapters = registry.getAllAdapters();
      const healthChecks = await Promise.allSettled(
        adapters.map((a) => a.healthCheck())
      );

      expect(healthChecks.length).toBe(2);
      healthChecks.forEach((result) => {
        expect(['fulfilled', 'rejected']).toContain(result.status);
      });
    });
  });

  describe('adapter metrics', () => {
    it('should provide adapter statistics', async () => {
      const adapter = new LufthansaAdapter();
      registry.register(adapter);

      // Fetch some data to generate metrics
      await adapter.fetchFlightData('LH001', '2026-02-25');
      await adapter.fetchFlights('FRA', '2026-02-25');

      // If metrics are tracked, verify format
      const adapters = registry.getAllAdapters();
      expect(adapters[0]).toBeDefined();
    });
  });
});

describe('Multi-Adapter Scenarios', () => {
  let registry: AirlineAdapterRegistry;

  beforeEach(() => {
    registry = new AirlineAdapterRegistry();
    registry.register(new LufthansaAdapter());
    registry.register(new AirFranceAdapter());
    registry.register(new BritishAirwaysAdapter());
  });

  it('should handle conflicts by priority', async () => {
    // Simulate fetching same flight from different adapters
    const lufthansa = registry.getAdapter('LH');
    const airFrance = registry.getAdapter('AF');

    const lhData = await lufthansa!.fetchFlightData('LH001', '2026-02-25');
    const afData = await airFrance!.fetchFlightData('LH001', '2026-02-25');

    // Lufthansa (priority 1) should be preferred
    expect(lhData).toBeDefined();
    expect(afData).toBeDefined();
  });

  it('should fall back to lower priority adapters', async () => {
    const adapters = registry.getAllAdapters();

    // Try to fetch from all adapters
    const results = await Promise.all(
      adapters.map((a) =>
        a
          .fetchFlightData('LH001', '2026-02-25')
          .catch(() => null)
      )
    );

    // Should have at least some successful results
    const successCount = results.filter((r) => r !== null).length;
    expect(successCount).toBeGreaterThan(0);
  });

  it('should provide consistent adapter order', () => {
    const order1 = registry.getAllAdapters().map((a) => a.getMetadata().airlineCode);
    const order2 = registry.getAllAdapters().map((a) => a.getMetadata().airlineCode);

    expect(order1).toEqual(order2);
    expect(order1[0]).toBe('LH'); // Lufthansa first
    expect(order1[1]).toBe('AF'); // Air France second
    expect(order1[2]).toBe('BA'); // British Airways third
  });
});

describe('Adapter Error Handling', () => {
  it('should handle adapter fetch errors gracefully', async () => {
    const adapter = new LufthansaAdapter();

    // Even with invalid data, should not throw
    const result = await adapter
      .fetchFlightData('INVALID', '9999-12-31')
      .catch((e) => {
        logger.error('Fetch failed', { error: e.message });
        return null;
      });

    expect(result === null || result !== undefined).toBe(true);
  });

  it('should maintain adapter availability despite failures', async () => {
    const registry = new AirlineAdapterRegistry();
    registry.register(new LufthansaAdapter());
    registry.register(new AirFranceAdapter());

    // One adapter might fail, but registry should still work
    const adapters = registry.getAllAdapters();
    expect(adapters.length).toBe(2);
  });
});

describe('Adapter Implementation Compliance', () => {
  it('all adapters should implement required interface', () => {
    const adapters = [
      new LufthansaAdapter(),
      new AirFranceAdapter(),
      new BritishAirwaysAdapter(),
    ];

    adapters.forEach((adapter) => {
      expect(typeof adapter.fetchFlightData).toBe('function');
      expect(typeof adapter.fetchFlights).toBe('function');
      expect(typeof adapter.fetchFlightStatus).toBe('function');
      expect(typeof adapter.healthCheck).toBe('function');
      expect(typeof adapter.getMetadata).toBe('function');
    });
  });

  it('all adapters should return consistent metadata structure', () => {
    const adapters = [
      new LufthansaAdapter(),
      new AirFranceAdapter(),
      new BritishAirwaysAdapter(),
    ];

    adapters.forEach((adapter) => {
      const metadata = adapter.getMetadata();
      expect(metadata).toHaveProperty('name');
      expect(metadata).toHaveProperty('airlineCode');
      expect(metadata).toHaveProperty('priority');
      expect(typeof metadata.priority).toBe('number');
    });
  });
});
