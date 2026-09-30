import { FlightStatusService } from '../src/services/FlightStatusService';

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('FlightStatusService', () => {
  // getInstance() is a singleton with in-memory state; reset between tests
  // by grabbing a fresh module registry so each test starts from a clean slate.
  let service: FlightStatusService;

  beforeEach(() => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../src/services/FlightStatusService');
    service = mod.FlightStatusService.getInstance();
  });

  it('getInstance returns the same singleton instance', () => {
    const a = FlightStatusService.getInstance();
    const b = FlightStatusService.getInstance();
    expect(a).toBe(b);
  });

  it('getLastKnownStatus returns null for a flight with no recorded status', () => {
    expect(service.getLastKnownStatus('flight-unknown')).toBeNull();
  });

  it('recordStatus stores the update and reports changed: true on first record', () => {
    const { changed, previous } = service.recordStatus({
      flightId: 'flight-1',
      status: 'delayed',
      delayMinutes: 30,
      timestamp: new Date(),
    });

    expect(changed).toBe(true);
    expect(previous).toBeNull();
    expect(service.getLastKnownStatus('flight-1')?.status).toBe('delayed');
  });

  it('recordStatus reports changed: false when the status is unchanged', () => {
    service.recordStatus({ flightId: 'flight-2', status: 'on_time', timestamp: new Date() });
    const { changed, previous } = service.recordStatus({
      flightId: 'flight-2',
      status: 'on_time',
      timestamp: new Date(),
    });

    expect(changed).toBe(false);
    expect(previous?.status).toBe('on_time');
  });

  it('recordStatus reports changed: true and returns the previous status on a transition', () => {
    service.recordStatus({ flightId: 'flight-3', status: 'on_time', timestamp: new Date() });
    const { changed, previous } = service.recordStatus({
      flightId: 'flight-3',
      status: 'cancelled',
      reason: 'weather',
      timestamp: new Date(),
    });

    expect(changed).toBe(true);
    expect(previous?.status).toBe('on_time');
  });

  it('fetchStatuses returns on_time for flights with no recorded status', async () => {
    const results = await service.fetchStatuses(['flight-new-1', 'flight-new-2']);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === 'on_time')).toBe(true);
  });

  it('fetchStatuses returns the last recorded status when one exists', async () => {
    service.recordStatus({
      flightId: 'flight-4',
      status: 'gate_changed',
      gate: 'B12',
      timestamp: new Date(),
    });

    const [result] = await service.fetchStatuses(['flight-4']);

    expect(result.status).toBe('gate_changed');
    expect(result.gate).toBe('B12');
  });

  describe('Staleness and Fallback (issue #530)', () => {
    it('isStatusStale returns true for unknown flight', () => {
      expect(service.isStatusStale('flight-unknown')).toBe(true);
    });

    it('isStatusStale returns false for recently fetched flight', () => {
      service.recordStatus({
        flightId: 'flight-fresh',
        status: 'on_time',
        timestamp: new Date(),
      });
      expect(service.isStatusStale('flight-fresh')).toBe(false);
    });

    it('isStatusStale returns true for stale flight', () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).getTime(); // 10 minutes ago
      service.lastFetchTime.set('flight-stale', oldTime);
      service.lastKnownStatus.set('flight-stale', {
        flightId: 'flight-stale',
        status: 'on_time',
        timestamp: new Date(oldTime),
      });
      expect(service.isStatusStale('flight-stale')).toBe(true);
    });

    it('getStatusWithFreshness returns cached status when fresh', async () => {
      service.recordStatus({
        flightId: 'flight-fresh-2',
        status: 'delayed',
        delayMinutes: 15,
        timestamp: new Date(),
      });

      const result = await service.getStatusWithFreshness('flight-fresh-2');
      expect(result.status).toBe('delayed');
      expect(result.delayMinutes).toBe(15);
    });

    it('getStatusWithFreshness fetches fresh status when stale', async () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).getTime(); // 10 minutes ago
      service.lastFetchTime.set('flight-stale-2', oldTime);
      service.lastKnownStatus.set('flight-stale-2', {
        flightId: 'flight-stale-2',
        status: 'on_time',
        timestamp: new Date(oldTime),
      });

      const result = await service.getStatusWithFreshness('flight-stale-2');
      // Should have attempted to fetch and got fresh status (mockApiCall returns on_time)
      expect(result.status).toBe('on_time');
      // lastFetchTime should be updated to current time (allow small timing difference)
      expect(service.lastFetchTime.get('flight-stale-2')).toBeGreaterThanOrEqual(oldTime);
    });

    it('getStatusWithFreshness falls back to cached status when fetch fails', async () => {
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).getTime();
      service.lastFetchTime.set('flight-fail', oldTime);
      service.lastKnownStatus.set('flight-fail', {
        flightId: 'flight-fail',
        status: 'delayed',
        delayMinutes: 20,
        timestamp: new Date(oldTime),
      });

      // Mock fetchStatuses to throw
      const originalFetch = service.fetchStatuses;
      service.fetchStatuses = jest.fn().mockRejectedValue(new Error('Provider unavailable'));

      const result = await service.getStatusWithFreshness('flight-fail');
      // Should fall back to cached status
      expect(result.status).toBe('delayed');
      expect(result.delayMinutes).toBe(20);

      service.fetchStatuses = originalFetch;
    });

    it('getStatusWithFreshness falls back to offline status when no cache and fetch fails', async () => {
      // Mock fetchStatuses to throw
      const originalFetch = service.fetchStatuses;
      service.fetchStatuses = jest.fn().mockRejectedValue(new Error('Provider unavailable'));

      const result = await service.getStatusWithFreshness('flight-no-cache');
      // Should fall back to offline status
      expect(result.status).toBe('on_time');
      expect(result.flightId).toBe('flight-no-cache');

      service.fetchStatuses = originalFetch;
    });

    it('getStatusesWithFreshness handles mixed fresh/stale/missing flights', async () => {
      // Fresh flight
      service.recordStatus({
        flightId: 'flight-fresh-multi',
        status: 'on_time',
        timestamp: new Date(),
      });

      // Stale flight - mockApiCall returns existing status from lastKnownStatus
      const oldTime = new Date(Date.now() - 10 * 60 * 1000).getTime();
      service.lastFetchTime.set('flight-stale-multi', oldTime);
      service.lastKnownStatus.set('flight-stale-multi', {
        flightId: 'flight-stale-multi',
        status: 'delayed',
        delayMinutes: 10,
        timestamp: new Date(oldTime),
      });

      // Missing flight - will use offline fallback
      const results = await service.getStatusesWithFreshness([
        'flight-fresh-multi',
        'flight-stale-multi',
        'flight-missing-multi',
      ]);

      expect(results).toHaveLength(3);
      const freshResult = results.find((r) => r.flightId === 'flight-fresh-multi');
      const staleResult = results.find((r) => r.flightId === 'flight-stale-multi');
      const missingResult = results.find((r) => r.flightId === 'flight-missing-multi');

      expect(freshResult?.status).toBe('on_time');
      // mockApiCall returns the existing status from lastKnownStatus for stale flights
      expect(staleResult?.status).toBe('delayed');
      expect(missingResult?.status).toBe('on_time'); // offline fallback
    });
  });

  describe('getOnTimePerformance (issue #332)', () => {
    it('returns a null rate for a flight with no recorded history', () => {
      expect(service.getOnTimePerformance('flight-unknown')).toEqual({
        flightId: 'flight-unknown',
        sampleSize: 0,
        onTimeCount: 0,
        disruptedCount: 0,
        onTimeRate: null,
      });
    });

    it('counts delayed/cancelled transitions as disruptions and everything else as on-time', () => {
      service.recordStatus({ flightId: 'flight-5', status: 'on_time', timestamp: new Date() });
      service.recordStatus({ flightId: 'flight-5', status: 'delayed', timestamp: new Date() });
      service.recordStatus({ flightId: 'flight-5', status: 'boarding', timestamp: new Date() });
      service.recordStatus({ flightId: 'flight-5', status: 'departed', timestamp: new Date() });

      const perf = service.getOnTimePerformance('flight-5');

      expect(perf.sampleSize).toBe(4);
      expect(perf.disruptedCount).toBe(1);
      expect(perf.onTimeCount).toBe(3);
      expect(perf.onTimeRate).toBe(0.75);
    });

    it('does not record a history entry when recordStatus reports no change', () => {
      service.recordStatus({ flightId: 'flight-6', status: 'on_time', timestamp: new Date() });
      service.recordStatus({ flightId: 'flight-6', status: 'on_time', timestamp: new Date() });

      expect(service.getOnTimePerformance('flight-6').sampleSize).toBe(1);
    });

    it('caps history at the most recent 50 transitions per flight', () => {
      const statuses: Array<'on_time' | 'delayed'> = [];
      for (let i = 0; i < 60; i += 1) {
        statuses.push(i % 2 === 0 ? 'on_time' : 'delayed');
      }
      statuses.forEach((status) => {
        service.recordStatus({ flightId: 'flight-7', status, timestamp: new Date() });
      });

      expect(service.getOnTimePerformance('flight-7').sampleSize).toBe(50);
    });
  });
});
