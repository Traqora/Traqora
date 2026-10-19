jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('node-cron', () => ({
  __esModule: true,
  default: { schedule: jest.fn() },
}));

import cron from 'node-cron';
import { SeatHoldExpiryJob } from '../../src/jobs/seatHoldExpiryJob';

describe('SeatHoldExpiryJob', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs the cleanup and reports released seats', async () => {
    const cleanup = jest.fn((): Promise<number> => Promise.resolve(3));
    const job = new SeatHoldExpiryJob(cleanup);

    await expect(job.runNow()).resolves.toEqual({ seatsReleased: 3 });
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('schedules one periodic sweep and stops it cleanly', () => {
    const stop = jest.fn();
    (cron.schedule as jest.Mock).mockReturnValue({ stop });
    const job = new SeatHoldExpiryJob();

    job.start();
    job.start();

    expect(cron.schedule).toHaveBeenCalledTimes(1);
    expect(cron.schedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));

    job.stop();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('propagates cleanup failures for the scheduler to log', async () => {
    const failure = new Error('cleanup unavailable');
    const job = new SeatHoldExpiryJob(() => Promise.reject(failure));

    await expect(job.runNow()).rejects.toBe(failure);
  });
});
