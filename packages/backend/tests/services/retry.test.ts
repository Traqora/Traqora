import { withRetries, sleep } from '../../src/services/retry';
import { withRetry } from '../../src/services/ErrorHandlingService';

jest.mock('../../src/services/ErrorHandlingService', () => ({
  withRetry: jest.fn(),
  sleep: jest.fn(),
}));

describe('withRetries legacy option mapping', () => {
  const withRetryMock = withRetry as jest.MockedFunction<typeof withRetry>;

  beforeEach(() => {
    withRetryMock.mockReset();
    withRetryMock.mockResolvedValue('ok');
  });

  it('maps maxAttempts to retries and keeps backoff disabled when requested', async () => {
    const operation = jest.fn(async () => 'done');

    await withRetries(operation, {
      maxAttempts: 3,
      delayMs: 25,
      backoff: false,
      operationName: 'sync_booking',
    });

    expect(withRetryMock).toHaveBeenCalledWith(operation, {
      retries: 2,
      baseDelayMs: 25,
      jitter: false,
      shouldRetry: undefined,
      operationName: 'sync_booking',
    });
  });

  it('prefers maxAttempts over retries and clamps retries at zero', async () => {
    const operation = jest.fn(async () => 'done');

    await withRetries(operation, {
      retries: 9,
      maxAttempts: 0,
    });

    expect(withRetryMock).toHaveBeenCalledWith(operation, {
      retries: 0,
      baseDelayMs: undefined,
      jitter: true,
      shouldRetry: undefined,
      operationName: undefined,
    });
  });

  it('passes through shouldRetry and defaults jitter to true', async () => {
    const operation = jest.fn(async () => 'done');
    const shouldRetry = jest.fn(() => true);

    await withRetries(operation, {
      baseDelayMs: 10,
      shouldRetry,
    });

    expect(withRetryMock).toHaveBeenCalledWith(operation, {
      retries: undefined,
      baseDelayMs: 10,
      jitter: true,
      shouldRetry,
      operationName: undefined,
    });
  });

  it('re-exports sleep from ErrorHandlingService', () => {
    const mockedSleep = jest.requireMock('../../src/services/ErrorHandlingService').sleep;
    expect(sleep).toBe(mockedSleep);
  });
});
