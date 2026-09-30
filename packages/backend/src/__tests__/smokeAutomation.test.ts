import { runProdSmokeCheck } from '../utils/smokeAutomation';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('runProdSmokeCheck', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return success true on 200 OK response', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: { status: 'healthy' },
    });

    const result = await runProdSmokeCheck({ targetUrl: 'https://api.traqora.io/health' });

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.errorDetails).toBeUndefined();
  });

  it('should return success false on HTTP 500 error', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 500,
      data: 'Internal Server Error',
    });

    const result = await runProdSmokeCheck({ targetUrl: 'https://api.traqora.io/health' });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.errorDetails).toBeDefined();
  });

  it('should handle request timeout failure mode correctly', async () => {
    const timeoutError: any = new Error('timeout of 1000ms exceeded');
    timeoutError.code = 'ECONNABORTED';
    mockedAxios.get.mockRejectedValueOnce(timeoutError);

    const result = await runProdSmokeCheck({
      targetUrl: 'https://api.traqora.io/health',
      timeoutMs: 1000,
    });

    expect(result.success).toBe(false);
    expect(result.errorDetails).toContain('Request timed out after 1000ms');
  });

  it('should handle invalid input gracefully without throwing', async () => {
    const result = await runProdSmokeCheck({ targetUrl: 'not-a-valid-url' });

    expect(result.success).toBe(false);
    expect(result.errorDetails).toContain('Invalid or missing targetUrl');
  });
});
