jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const addMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../../src/jobs/deadLetterQueue', () => ({
  deadLetterQueue: { add: (...args: unknown[]) => addMock(...args) },
}));

const handlers: Record<string, (...args: any[]) => void> = {};
jest.mock('../../src/jobs/notificationQueue', () => ({
  notificationQueue: {
    process: jest.fn(),
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    }),
  },
}));

import { setupNotificationWorker } from '../../src/jobs/notificationWorker';

describe('notificationWorker dead-letter handling (issue #546)', () => {
  beforeEach(() => {
    addMock.mockClear();
    setupNotificationWorker();
  });

  const makeJob = (overrides: Partial<{ id: string; attemptsMade: number; attempts: number; data: any }> = {}) => ({
    id: overrides.id ?? 'job-1',
    attemptsMade: overrides.attemptsMade ?? 3,
    opts: { attempts: overrides.attempts ?? 3 },
    data: overrides.data ?? { userId: 'u1', type: 'booking' },
  });

  it('quarantines the job once the final Bull attempt has failed', () => {
    const job = makeJob({ attemptsMade: 3, attempts: 3 });
    handlers['failed'](job, new Error('smtp down'));

    expect(addMock).toHaveBeenCalledWith({
      id: 'job-1',
      queue: 'notification-worker',
      type: 'booking',
      data: job.data,
      attempts: 3,
      error: 'smtp down',
    });
  });

  it('does not quarantine when Bull still has attempts remaining', () => {
    const job = makeJob({ attemptsMade: 1, attempts: 3 });
    handlers['failed'](job, new Error('transient'));

    expect(addMock).not.toHaveBeenCalled();
  });
});
