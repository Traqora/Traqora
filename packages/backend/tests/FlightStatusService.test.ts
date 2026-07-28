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
