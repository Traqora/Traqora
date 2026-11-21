const mockFindOne = jest.fn();
const mockSave = jest.fn();
const mockCreate = jest.fn();

jest.mock('../db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn(() => ({
      findOne: mockFindOne,
      save: mockSave,
      create: mockCreate,
    })),
  },
}));

import { NotificationHistoryService, DELIVERY_LIFECYCLE_KEY } from './NotificationHistoryService';

describe('NotificationHistoryService delivery lifecycle', () => {
  let service: NotificationHistoryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationHistoryService();
  });

  test('initial log records accepted state and redacts metadata secrets', async () => {
    const log = { id: 'log-1' };
    mockCreate.mockReturnValue(log);
    mockSave.mockImplementation(async (value) => ({ ...value, id: 'log-1' }));

    await service.logDelivery({
      userId: 'user-1',
      channel: 'email',
      category: 'booking',
      status: 'sent',
      title: 'Confirmed',
      body: 'Your booking is confirmed',
      recipient: 'user@example.com',
      metadata: { apiKey: 'secret', provider: 'sendgrid' },
    });

    const created = mockCreate.mock.calls[0][0];
    expect(created.payload[DELIVERY_LIFECYCLE_KEY]).toBe('accepted');
    expect(created.payload.metadata).toEqual({
      apiKey: '[REDACTED]',
      provider: 'sendgrid',
    });
  });

  test('records acceptance, failure, retry and terminal in order', async () => {
    const log = {
      id: 'log-1',
      status: 'pending',
      attempts: 1,
      payload: { [DELIVERY_LIFECYCLE_KEY]: 'accepted', metadata: {} },
    };
    mockFindOne.mockResolvedValue(log);
    mockSave.mockImplementation(async (value) => value);

    await service.recordProviderAcceptance('log-1', 'provider-1', { authToken: 'x' });
    expect(log.payload.externalId).toBe('provider-1');
    expect(log.payload.authToken).toBe('[REDACTED]');
    expect(log.status).toBe('sent');

    await service.recordDeliveryFailure('log-1', 'provider unavailable', { token: 'y' });
    expect(log.payload[DELIVERY_LIFECYCLE_KEY]).toBe('failed');
    expect(log.payload.token).toBe('[REDACTED]');
    expect(log.errorMessage).toBe('provider unavailable');

    await service.recordRetry('log-1', { attempt: 2 });
    expect(log.payload[DELIVERY_LIFECYCLE_KEY]).toBe('retrying');
    expect(log.status).toBe('pending');

    await service.markTerminal('log-1', { reason: 'max attempts' });
    expect(log.payload[DELIVERY_LIFECYCLE_KEY]).toBe('terminal');
    expect(log.status).toBe('failed');
  });

  test('ignores invalid transitions such as reviving a terminal delivery', async () => {
    const log = {
      id: 'log-1',
      status: 'failed',
      attempts: 2,
      payload: { [DELIVERY_LIFECYCLE_KEY]: 'terminal' },
    };
    mockFindOne.mockResolvedValue(log);
    mockSave.mockImplementation(async (value) => value);

    const result = await service.recordRetry('log-1');

    expect(result).toBe(log);
    expect(log.payload[DELIVERY_LIFECYCLE_KEY]).toBe('terminal');
    expect(mockSave).not.toHaveBeenCalled();
  });

  test('returns null when the log entry does not exist', async () => {
    mockFindOne.mockResolvedValue(null);
    await expect(service.markTerminal('missing')).resolves.toBeNull();
  });
});
