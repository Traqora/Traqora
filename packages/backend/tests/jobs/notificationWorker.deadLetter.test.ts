jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const addMock = jest.fn().mockResolvedValue(undefined);
const mockHandlers: Record<string, (...args: any[]) => void> = {};
let mockProcessor: ((job: any) => Promise<any>) | undefined;
const mockEmailSend = jest.fn();
const mockSmsSend = jest.fn();
const mockPushSend = jest.fn();
const mockUserPreferenceRepo = { findOne: jest.fn() };
const mockNotificationLogRepo = {
  findOne: jest.fn(),
  create: jest.fn((entry: any) => entry),
  save: jest.fn(async (entry: any) => entry),
};
const mockUserPreference = {
  userId: 'u1',
  emailEnabled: true,
  email: 'u1@example.com',
  smsEnabled: false,
  phoneNumber: undefined,
  pushEnabled: true,
  pushOptedIn: true,
  pushBookingEnabled: true,
  pushReminderEnabled: true,
  pushRefundEnabled: true,
  pushPromoEnabled: true,
};

jest.mock('../../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: (entity: { name: string }) =>
      entity.name === 'UserPreference' ? mockUserPreferenceRepo : mockNotificationLogRepo,
  },
}));
jest.mock('../../src/services/EmailService', () => ({
  emailService: { send: (...args: unknown[]) => mockEmailSend(...args) },
}));
jest.mock('../../src/services/SMSService', () => ({
  smsService: { send: (...args: unknown[]) => mockSmsSend(...args) },
}));
jest.mock('../../src/services/PushNotificationService', () => ({
  pushNotificationService: { sendTypedPush: (...args: unknown[]) => mockPushSend(...args) },
}));
jest.mock('../../src/jobs/deadLetterQueue', () => ({
  deadLetterQueue: { add: (...args: unknown[]) => addMock(...args) },
}));
jest.mock('../../src/jobs/notificationQueue', () => ({
  notificationQueue: {
    process: jest.fn((processor: (job: any) => Promise<any>) => {
      mockProcessor = processor;
    }),
    on: jest.fn((event: string, handler: (...args: any[]) => void) => {
      mockHandlers[event] = handler;
    }),
  },
}));

import { setupNotificationWorker } from '../../src/jobs/notificationWorker';

describe('notificationWorker dead-letter handling (issue #546)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    addMock.mockClear();
    mockProcessor = undefined;
    Object.keys(mockHandlers).forEach((event) => delete mockHandlers[event]);
    mockUserPreferenceRepo.findOne.mockResolvedValue({ ...mockUserPreference });
    mockNotificationLogRepo.findOne.mockResolvedValue(null);
    mockEmailSend.mockResolvedValue(undefined);
    mockSmsSend.mockResolvedValue(undefined);
    mockPushSend.mockResolvedValue({ successful: 1, failed: 0 });
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
    mockHandlers['failed'](job, new Error('smtp down'));

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
    mockHandlers['failed'](job, new Error('transient'));

    expect(addMock).not.toHaveBeenCalled();
  });

  it('delivers through the registered processor and records successful channels', async () => {
    const data = { bookingReference: 'booking-1' };
    const job = makeJob({
      attemptsMade: 0,
      data: { userId: 'u1', type: 'booking', data, channels: ['email'] },
    });

    const result = await mockProcessor!(job);

    expect(mockEmailSend).toHaveBeenCalledWith('u1@example.com', 'booking', data);
    expect(mockNotificationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'u1',
      channel: 'email',
      type: 'booking',
      status: 'sent',
      attempts: 1,
      idempotencyKey: 'job:job-1',
    }));
    expect(result).toEqual([{ channel: 'email', status: 'success' }]);
  });

  it('skips a channel already sent for the same idempotency key', async () => {
    mockNotificationLogRepo.findOne.mockResolvedValue({ status: 'sent' });
    const job = makeJob({
      data: {
        userId: 'u1',
        type: 'booking',
        data: {},
        channels: ['email'],
        idempotencyKey: 'booking-key',
      },
    });

    const result = await mockProcessor!(job);

    expect(mockEmailSend).not.toHaveBeenCalled();
    expect(result).toEqual([{ channel: 'email', status: 'skipped_duplicate' }]);
  });

  it('records a failed channel and rejects so Bull can retry the job', async () => {
    mockEmailSend.mockRejectedValue(new Error('smtp down'));
    const job = makeJob({
      attemptsMade: 0,
      data: { userId: 'u1', type: 'booking', data: {}, channels: ['email'] },
    });

    await expect(mockProcessor!(job)).rejects.toThrow('Failed to send notification via email');
    expect(mockNotificationLogRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'email',
      status: 'failed',
      errorMessage: 'smtp down',
      attempts: 1,
    }));
  });

  it('sends push only for opted-in users with the corresponding preference enabled', async () => {
    const data = { bookingReference: 'booking-2' };
    const job = makeJob({
      data: { userId: 'u1', type: 'booking', data, channels: ['push'] },
    });

    const result = await mockProcessor!(job);

    expect(mockPushSend).toHaveBeenCalledWith('u1', 'booking', data);
    expect(result).toEqual([{ channel: 'push', status: 'success' }]);
  });

  it('does not send push when the user has not explicitly opted in', async () => {
    mockUserPreferenceRepo.findOne.mockResolvedValue({
      ...mockUserPreference,
      pushOptedIn: false,
    });
    const job = makeJob({
      data: { userId: 'u1', type: 'booking', data: {}, channels: ['push'] },
    });

    const result = await mockProcessor!(job);

    expect(mockPushSend).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});
