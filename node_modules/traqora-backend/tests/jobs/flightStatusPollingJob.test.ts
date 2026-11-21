jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const distinctExecMock = jest.fn();
jest.mock('../../src/models/FlightStatusAlert', () => ({
  __esModule: true,
  default: {
    distinct: jest.fn(() => ({ exec: distinctExecMock })),
  },
}));

const notifyFlightStatusChangeMock = jest.fn();
jest.mock('../../src/services/flightStatusNotifier', () => ({
  notifyFlightStatusChange: (...args: unknown[]) => notifyFlightStatusChangeMock(...args),
}));

import { FlightStatusPollingJob } from '../../src/jobs/flightStatusPollingJob';
import { FlightStatusService } from '../../src/services/FlightStatusService';

describe('FlightStatusPollingJob (issue #332)', () => {
  let statusService: FlightStatusService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('../../src/services/FlightStatusService');
    statusService = mod.FlightStatusService.getInstance();
    notifyFlightStatusChangeMock.mockResolvedValue({ notifiedCount: 1 });
  });

  it('is a no-op when nothing has an active alert', async () => {
    distinctExecMock.mockResolvedValue([]);

    const job = new FlightStatusPollingJob(statusService);
    const result = await job.runNow();

    expect(result).toEqual({ polled: 0, changed: 0, notified: 0 });
    expect(notifyFlightStatusChangeMock).not.toHaveBeenCalled();
  });

  it('notifies for a flight whose status changed since the last poll', async () => {
    distinctExecMock.mockResolvedValue(['FL1']);
    statusService.recordStatus({ flightId: 'FL1', status: 'on_time', timestamp: new Date() });
    jest
      .spyOn(statusService, 'fetchStatuses')
      .mockResolvedValue([{ flightId: 'FL1', status: 'delayed', delayMinutes: 15, timestamp: new Date() }]);

    const job = new FlightStatusPollingJob(statusService);
    const result = await job.runNow();

    expect(result).toEqual({ polled: 1, changed: 1, notified: 1 });
    expect(notifyFlightStatusChangeMock).toHaveBeenCalledWith(
      expect.objectContaining({ flightId: 'FL1', status: 'delayed' }),
    );
  });

  it('does not notify for a flight whose status is unchanged', async () => {
    distinctExecMock.mockResolvedValue(['FL1']);
    statusService.recordStatus({ flightId: 'FL1', status: 'on_time', timestamp: new Date() });
    jest
      .spyOn(statusService, 'fetchStatuses')
      .mockResolvedValue([{ flightId: 'FL1', status: 'on_time', timestamp: new Date() }]);

    const job = new FlightStatusPollingJob(statusService);
    const result = await job.runNow();

    expect(result).toEqual({ polled: 1, changed: 0, notified: 0 });
    expect(notifyFlightStatusChangeMock).not.toHaveBeenCalled();
  });

  it('continues to the next flight when notifying one fails', async () => {
    distinctExecMock.mockResolvedValue(['FL1', 'FL2']);
    jest.spyOn(statusService, 'fetchStatuses').mockResolvedValue([
      { flightId: 'FL1', status: 'delayed', timestamp: new Date() },
      { flightId: 'FL2', status: 'cancelled', timestamp: new Date() },
    ]);
    notifyFlightStatusChangeMock
      .mockRejectedValueOnce(new Error('notify failed'))
      .mockResolvedValueOnce({ notifiedCount: 3 });

    const job = new FlightStatusPollingJob(statusService);
    const result = await job.runNow();

    expect(result).toEqual({ polled: 2, changed: 2, notified: 3 });
  });

  it('returns zero counts without throwing when loading active flights fails', async () => {
    distinctExecMock.mockRejectedValue(new Error('db down'));

    const job = new FlightStatusPollingJob(statusService);
    const result = await job.runNow();

    expect(result).toEqual({ polled: 0, changed: 0, notified: 0 });
  });
});
