import axios, { AxiosError } from 'axios';
import { logger } from './logger';

export interface SmokeCheckInput {
  targetUrl: string;
  timeoutMs?: number;
}

export interface SmokeCheckResult {
  success: boolean;
  latencyMs: number;
  statusCode?: number;
  errorDetails?: string;
}

/**
 * Executes a production smoke check against a given target URL.
 * Validates inputs, measures latency, handles timeouts, and captures error states.
 */
export async function runProdSmokeCheck(input: SmokeCheckInput): Promise<SmokeCheckResult> {
  const { targetUrl, timeoutMs = 5000 } = input;

  if (!targetUrl || typeof targetUrl !== 'string' || !targetUrl.startsWith('http')) {
    return {
      success: false,
      latencyMs: 0,
      errorDetails: 'Invalid or missing targetUrl provided',
    };
  }

  const startTime = Date.now();

  try {
    const response = await axios.get(targetUrl, {
      timeout: timeoutMs,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    const latencyMs = Date.now() - startTime;
    const success = response.status >= 200 && response.status < 400;

    return {
      success,
      latencyMs,
      statusCode: response.status,
      errorDetails: success ? undefined : `HTTP status ${response.status} received`,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - startTime;
    const err = error as AxiosError;
    
    let errorDetails = err.message || 'Unknown network error during smoke test';
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      errorDetails = `Request timed out after ${timeoutMs}ms`;
    }

    logger.error('Production smoke check failed', { targetUrl, error: errorDetails });

    return {
      success: false,
      latencyMs,
      statusCode: err.response?.status,
      errorDetails,
    };
  }
}
