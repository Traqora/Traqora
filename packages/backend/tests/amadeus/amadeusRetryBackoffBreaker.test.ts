import axios from 'axios';
import { CircuitBreaker } from '../../src/services/ErrorHandlingService';
import { AmadeusAnalyticsClient } from '../../src/services/amadeus/amadeusClient';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Amadeus retry + backoff + circuit breaker', () => {
  let mockAxiosInstance: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance = {
      interceptors: {
        response: { use: jest.fn() },
        request: { use: jest.fn() },
      },
      get: jest.fn(),
      post: jest.fn(),
    };
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);
  });

  it('opens the breaker after the configured failure threshold', async () => {
    const breaker = new CircuitBreaker('amadeus', {
      failureThreshold: 2,
      recoveryTimeoutMs: 1000,
    });

    const fail = jest.fn().mockRejectedValue(new Error('timeout'));

    await expect(breaker.execute(fail)).rejects.toThrow('timeout');
    expect(breaker.getState()).toBe('CLOSED');

    await expect(breaker.execute(fail)).rejects.toThrow('timeout');
    expect(breaker.getState()).toBe('OPEN');

    await expect(breaker.execute(jest.fn().mockResolvedValue('ok'))).rejects.toThrow(
      'External service is temporarily unavailable'
    );
  });

  it('retries a transient Amadeus error with backoff before succeeding', async () => {
    const client = new AmadeusAnalyticsClient({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      timeout: 5000,
      circuitBreakerThreshold: 5,
      circuitBreakerResetTimeout: 1000,
      retryOptions: {
        retries: 2,
        baseDelayMs: 1,
        maxDelayMs: 2,
        jitter: false,
      },
    });

    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'token', expires_in: 3600 },
    });
    mockAxiosInstance.get
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({
        status: 200,
        data: { data: [] },
      });

    const result = await client.searchFlights({
      originLocationCode: 'FRA',
      destinationLocationCode: 'LAX',
      departureDate: '2026-02-25',
      adults: 1,
    });

    expect(result).toEqual([]);
    expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    expect(client.getCircuitBreakerStatus().state).toBe('CLOSED');
  });
});
