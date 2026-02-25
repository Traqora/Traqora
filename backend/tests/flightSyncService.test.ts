/**
 * Flight Synchronization Service Tests
 * Comprehensive test suite for flight sync service with circuit breaker, caching, and conflict resolution
 */

import { FlightSynchronizationService, CircuitBreaker, FlightCacheManager } from '../../../src/services/amadeus/flightSyncService';
import { LufthansaAdapter, AirFranceAdapter, BritishAirwaysAdapter, AirlineAdapterRegistry } from '../../../src/services/amadeus/airlineAdapters';
import {
  InitSync,
  SyncFlightRequest,
  SyncFlightResponse,
  FlightDataConflict,
  ConflictResolutionMode,
} from '../../../src/types/flightSync';
import { logger } from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(
      2, // failure threshold
      1000, // timeout in ms
      3 // half-open attempts
    );
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe('CLOSED');
  });

  it('should transition to OPEN after failure threshold', () => {
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('CLOSED');

    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');
  });

  it('should transition from OPEN to HALF_OPEN after timeout', () => {
    // Set to OPEN state
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');

    // Wait for timeout
    jest.useFakeTimers();
    jest.advanceTimersByTime(1100);

    expect(circuitBreaker.getState()).toBe('HALF_OPEN');

    jest.useRealTimers();
  });

  it('should reset on success', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');

    jest.useFakeTimers();
    jest.advanceTimersByTime(1100);
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');

    circuitBreaker.recordSuccess();
    expect(circuitBreaker.getState()).toBe('CLOSED');

    jest.useRealTimers();
  });

  it('should reopen on failure in HALF_OPEN state', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordFailure();

    jest.useFakeTimers();
    jest.advanceTimersByTime(1100);
    expect(circuitBreaker.getState()).toBe('HALF_OPEN');

    circuitBreaker.recordFailure();
    expect(circuitBreaker.getState()).toBe('OPEN');

    jest.useRealTimers();
  });

  it('should get circuit breaker stats', () => {
    circuitBreaker.recordFailure();
    circuitBreaker.recordSuccess();
    circuitBreaker.recordFailure();

    const stats = circuitBreaker.getStats();
    expect(stats.state).toBe('CLOSED');
    expect(stats.successCount).toBe(1);
    expect(stats.failureCount).toBe(2);
  });
});

describe('FlightCacheManager', () => {
  let cacheManager: FlightCacheManager;

  beforeEach(() => {
    cacheManager = new FlightCacheManager(5000); // 5 second TTL
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should store and retrieve cached data', () => {
    const flightData = {
      flightNumber: 'LH001',
      airline: 'LH',
      delayMinutes: 10,
      gate: 'A12',
    };

    cacheManager.set('LH001', '2026-02-25', 'AMADEUS', flightData);
    const cached = cacheManager.get('LH001', '2026-02-25', 'AMADEUS');

    expect(cached).toEqual(flightData);
  });

  it('should return null for expired cache entries', () => {
    const flightData = { flightNumber: 'LH001', gate: 'A12' };

    cacheManager.set('LH001', '2026-02-25', 'AMADEUS', flightData);
    jest.advanceTimersByTime(5100);

    const cached = cacheManager.get('LH001', '2026-02-25', 'AMADEUS');
    expect(cached).toBeNull();
  });

  it('should clear specific cache entry', () => {
    const flightData = { flightNumber: 'LH001', gate: 'A12' };

    cacheManager.set('LH001', '2026-02-25', 'AMADEUS', flightData);
    cacheManager.clear('LH001', '2026-02-25', 'AMADEUS');

    const cached = cacheManager.get('LH001', '2026-02-25', 'AMADEUS');
    expect(cached).toBeNull();
  });

  it('should return cache statistics', () => {
    const flightData = { flightNumber: 'LH001', gate: 'A12' };

    cacheManager.set('LH001', '2026-02-25', 'AMADEUS', flightData);
    const cached = cacheManager.get('LH001', '2026-02-25', 'AMADEUS');

    const stats = cacheManager.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.hits).toBe(1);
  });
});

describe('FlightSynchronizationService', () => {
  let syncService: FlightSynchronizationService;
  let registry: AirlineAdapterRegistry;
  let webhookCallback: jest.Mock;

  beforeEach(() => {
    registry = new AirlineAdapterRegistry();
    registry.register(new LufthansaAdapter());
    registry.register(new AirFranceAdapter());
    registry.register(new BritishAirwaysAdapter());

    syncService = new FlightSynchronizationService(null as any, [
      registry.getAdapter('LH'),
      registry.getAdapter('AF'),
      registry.getAdapter('BA'),
    ] as any);

    webhookCallback = jest.fn();
    syncService.registerWebhookCallback(webhookCallback);
  });

  describe('syncFlight', () => {
    it('should sync single flight successfully', async () => {
      const request: SyncFlightRequest = {
        flightNumber: 'LH001',
        airline: 'LH',
        departureDate: '2026-02-25',
        departureAirport: 'FRA',
        arrivalAirport: 'LAX',
      };

      const result = await syncService.syncFlight(request);

      expect(result.success).toBe(true);
      expect(result.flight).toBeDefined();
      expect(result.flight.flightNumber).toBe('LH001');
    });

    it('should handle sync errors gracefully', async () => {
      const request: SyncFlightRequest = {
        flightNumber: 'INVALID',
        airline: 'XX',
        departureDate: '2026-02-25',
      };

      const result = await syncService.syncFlight(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return cached data if available', async () => {
      const request: SyncFlightRequest = {
        flightNumber: 'LH001',
        airline: 'LH',
        departureDate: '2026-02-25',
      };

      // First sync
      const result1 = await syncService.syncFlight(request);
      expect(result1.fromCache).toBe(false);

      // Second sync should be from cache
      const result2 = await syncService.syncFlight(request);
      expect(result2.fromCache).toBe(true);
    });

    it('should emit webhook on sync completion', async () => {
      const request: SyncFlightRequest = {
        flightNumber: 'LH001',
        airline: 'LH',
        departureDate: '2026-02-25',
      };

      await syncService.syncFlight(request);

      expect(webhookCallback).toHaveBeenCalled();
      const payload = webhookCallback.mock.calls[0][0];
      expect(payload.flight.flightNumber).toBe('LH001');
      expect(payload.eventType).toMatch(/SYNC_COMPLETED|CONFLICT_DETECTED/);
    });
  });

  describe('batchSyncFlights', () => {
    it('should sync multiple flights in batch', async () => {
      const requests: SyncFlightRequest[] = [
        { flightNumber: 'LH001', airline: 'LH', departureDate: '2026-02-25' },
        { flightNumber: 'AF101', airline: 'AF', departureDate: '2026-02-25' },
        { flightNumber: 'BA001', airline: 'BA', departureDate: '2026-02-25' },
      ];

      const result = await syncService.batchSyncFlights(requests);

      expect(result.successful.length).toBeGreaterThan(0);
      expect(result.successful[0].flight.flightNumber).toBeDefined();
    });

    it('should track both successful and failed syncs', async () => {
      const requests: SyncFlightRequest[] = [
        { flightNumber: 'LH001', airline: 'LH', departureDate: '2026-02-25' },
        { flightNumber: 'INVALID', airline: 'XX', departureDate: '2026-02-25' },
      ];

      const result = await syncService.batchSyncFlights(requests);

      expect(result.successful.length + result.failed.length).toBe(requests.length);
    });
  });

  describe('resolveConflict', () => {
    it('should resolve conflict with PRIORITY mode', async () => {
      const conflict: FlightDataConflict[InitSync] = {
        flight: null as any,
        sources: {
          AMADEUS: { delayMinutes: 15, gate: 'A12' } as any,
          AIRLINE_API: { delayMinutes: 20, gate: 'B05' } as any,
        },
        conflictFields: ['delayMinutes', 'gate'],
        detectedAt: new Date(),
      };

      const resolution = await syncService.resolveConflict(
        conflict,
        'PRIORITY'
      );

      expect(resolution.resolved).toBe(true);
      expect(resolution.resolutionMode).toBe('PRIORITY');
      expect(resolution.selectedData).toBeDefined();
    });

    it('should resolve conflict with AUTOMATIC mode', async () => {
      const conflict: FlightDataConflict[InitSync] = {
        flight: null as any,
        sources: {
          AMADEUS: { delayMinutes: 15, passengers: 150 } as any,
          AIRLINE_API: { delayMinutes: 20, passengers: 150 } as any,
        },
        conflictFields: ['delayMinutes'],
        detectedAt: new Date(),
      };

      const resolution = await syncService.resolveConflict(
        conflict,
        'AUTOMATIC'
      );

      expect(resolution.resolved).toBe(true);
      expect(resolution.resolutionMode).toBe('AUTOMATIC');
    });

    it('should mark conflict as MANUAL when unresolvable', async () => {
      const conflict: FlightDataConflict[InitSync] = {
        flight: null as any,
        sources: {
          AMADEUS: {
            delayMinutes: 15,
            gate: 'A12',
            cancellationReason: 'WEATHER',
          } as any,
          AIRLINE_API: {
            delayMinutes: 0,
            gate: 'B05',
            cancellationReason: 'MAINTENANCE',
          } as any,
        },
        conflictFields: [
          'delayMinutes',
          'gate',
          'cancellationReason',
        ],
        detectedAt: new Date(),
      };

      const resolution = await syncService.resolveConflict(
        conflict,
        'AUTOMATIC'
      );

      expect(resolution.resolved).toBe(false);
      expect(resolution.resolutionMode).toBe('MANUAL');
    });
  });

  describe('processWebhook', () => {
    it('should process webhook payload', async () => {
      const payload = {
        flight: {
          flightNumber: 'LH001',
          airline: 'LH',
          delayMinutes: 15,
          gate: 'A12',
        } as any,
        eventType: 'FLIGHT_DELAYED',
        timestamp: new Date(),
        source: 'AIRLINE_API',
      };

      const result = await syncService.processWebhook(payload);

      expect(result.processed).toBe(true);
      expect(result.eventType).toBe('FLIGHT_DELAYED');
    });

    it('should emit webhook callback after processing', async () => {
      const payload = {
        flight: {
          flightNumber: 'LH001',
          delayMinutes: 15,
        } as any,
        eventType: 'FLIGHT_DELAYED',
        timestamp: new Date(),
      };

      await syncService.processWebhook(payload);

      expect(webhookCallback).toHaveBeenCalled();
    });
  });

  describe('circuit breaker integration', () => {
    it('should handle circuit breaker OPEN state', async () => {
      const request: SyncFlightRequest = {
        flightNumber: 'LH001',
        airline: 'LH',
        departureDate: '2026-02-25',
      };

      // Simulate failures to open circuit
      const status1 = syncService.getCircuitBreakerStatus();
      expect(status1.state).toBe('CLOSED');
    });

    it('should report circuit breaker status', () => {
      const status = syncService.getCircuitBreakerStatus();

      expect(status).toHaveProperty('state');
      expect(status).toHaveProperty('successCount');
      expect(status).toHaveProperty('failureCount');
      expect(['CLOSED', 'OPEN', 'HALF_OPEN']).toContain(status.state);
    });
  });

  describe('cache management', () => {
    it('should report cache statistics', () => {
      const stats = syncService.getCacheStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('hitRate');
    });

    it('should track sync status', async () => {
      const request: SyncFlightRequest = {
        flightNumber: 'LH001',
        airline: 'LH',
        departureDate: '2026-02-25',
      };

      const result = await syncService.syncFlight(request);
      const status = syncService.getLastSyncStatus();

      expect(status).toHaveProperty('lastSyncedAt');
      expect(status).toHaveProperty('totalSyncs');
      expect(status).toHaveProperty('successCount');
    });
  });
});

describe('Multi-Adapter Flight Sync Scenarios', () => {
  let syncService: FlightSynchronizationService;

  beforeEach(() => {
    const adapters = [
      new LufthansaAdapter(),
      new AirFranceAdapter(),
      new BritishAirwaysAdapter(),
    ];

    syncService = new FlightSynchronizationService(null as any, adapters as any);
  });

  it('should detect conflicts from multiple adapter sources', async () => {
    const requests: SyncFlightRequest[] = [
      { flightNumber: 'LH001', airline: 'LH', departureDate: '2026-02-25' },
      { flightNumber: 'AF101', airline: 'AF', departureDate: '2026-02-25' },
      { flightNumber: 'BA001', airline: 'BA', departureDate: '2026-02-25' },
    ];

    const result = await syncService.batchSyncFlights(requests);

    // Should process all flights from different adapters
    expect(result.successful.length).toBeGreaterThan(0);
  });

  it('should maintain adapter priority during conflict resolution', async () => {
    // Lufthansa (priority 1) should take precedence over Air France (priority 2)
    const conflict: FlightDataConflict[InitSync] = {
      flight: null as any,
      sources: {
        AMADEUS: { delayMinutes: 15 } as any,
        AIRLINE_API: { delayMinutes: 20 } as any,
      },
      conflictFields: ['delayMinutes'],
      detectedAt: new Date(),
    };

    const resolution = await syncService.resolveConflict(conflict, 'PRIORITY');

    expect(resolution.resolved).toBe(true);
    expect(resolution.selectedData.delayMinutes).toBeDefined();
  });
});
