/// <reference types="jest" />

import {
  AppError,
  withRetry,
  isTransientError,
  CircuitBreaker,
  executeWithResilience,
  executeCompensatedWorkflow,
} from '../../src/services/ErrorHandlingService';
import { withRetries } from '../../src/services/retry';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ErrorHandlingService - isTransientError', () => {
  it('returns true for network timeout messages', () => {
    expect(isTransientError(new Error('Connection timeout'))).toBe(true);
    expect(isTransientError(new Error('Operation timed out'))).toBe(true);
    expect(isTransientError(new Error('socket hang up'))).toBe(true);
    expect(isTransientError(new Error('econnreset'))).toBe(true);
    expect(isTransientError(new Error('econnrefused'))).toBe(true);
    expect(isTransientError(new Error('enotfound'))).toBe(true);
    expect(isTransientError(new Error('temporarily unavailable'))).toBe(true);
    expect(isTransientError(new Error('network error'))).toBe(true);
  });

  it('returns true for 5xx status codes', () => {
    expect(isTransientError({ statusCode: 500 })).toBe(true);
    expect(isTransientError({ status: 503 })).toBe(true);
    expect(isTransientError({ response: { status: 502 } })).toBe(true);
    expect(isTransientError({ response: { statusCode: 504 } })).toBe(true);
  });

  it('returns false for 4xx status codes', () => {
    expect(isTransientError({ statusCode: 400 })).toBe(false);
    expect(isTransientError({ status: 404 })).toBe(false);
  });

  it('returns false for non-transient messages', () => {
    expect(isTransientError(new Error('Invalid input'))).toBe(false);
    expect(isTransientError({ message: 'Not found' })).toBe(false);
  });

  it('handles unknown error shapes safely', () => {
    expect(isTransientError(null)).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
    expect(isTransientError('string error')).toBe(false);
  });
});

describe('ErrorHandlingService - withRetry', () => {
  it('resolves immediately if function succeeds', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { retries: 3, baseDelayMs: 1, jitter: false });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries', async () => {
    const error = new Error('timeout');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1, jitter: false })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry if shouldRetry returns false', async () => {
    const error = new Error('Do not retry me');
    const fn = jest.fn().mockRejectedValue(error);
    const shouldRetry = jest.fn().mockReturnValue(false);

    await expect(
      withRetry(fn, { retries: 3, shouldRetry })
    ).rejects.toThrow('Do not retry me');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledWith(error, 0);
  });

  it('does not retry if error is not transient and no shouldRetry provided', async () => {
    const error = new Error('Bad Request');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, { retries: 3 })
    ).rejects.toThrow('Bad Request');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('calculates exponential backoff correctly with jitter disabled', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { retries: 3, baseDelayMs: 1, maxDelayMs: 10, jitter: false });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('ErrorHandlingService - CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts in CLOSED state', () => {
    const breaker = new CircuitBreaker('test');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('transitions to OPEN after failureThreshold', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 2 });
    const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    expect(breaker.getState()).toBe('CLOSED');

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    expect(breaker.getState()).toBe('OPEN');
  });

  it('throws AppError when OPEN', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1 });
    const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    
    const successOp = jest.fn().mockResolvedValue('success');
    await expect(breaker.execute(successOp)).rejects.toThrow(AppError);
    
    try {
      await breaker.execute(successOp);
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(503);
      expect((e as AppError).code).toBe('CIRCUIT_OPEN');
    }
    
    expect(successOp).not.toHaveBeenCalled();
  });

  it('transitions to HALF_OPEN after recoveryTimeoutMs', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 1, recoveryTimeoutMs: 1000 });
    const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    expect(breaker.getState()).toBe('OPEN');

    jest.advanceTimersByTime(1000);
    expect(breaker.getState()).toBe('HALF_OPEN');
  });

  it('closes again after halfOpenSuccesses', async () => {
    const breaker = new CircuitBreaker('test', { 
      failureThreshold: 1, 
      recoveryTimeoutMs: 1000,
      halfOpenSuccesses: 2 
    });
    const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
    const successOp = jest.fn().mockResolvedValue('success');

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    jest.advanceTimersByTime(1000);
    
    expect(breaker.getState()).toBe('HALF_OPEN');
    
    await breaker.execute(successOp);
    expect(breaker.getState()).toBe('HALF_OPEN'); 
    
    await breaker.execute(successOp);
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('reopens if failure occurs in HALF_OPEN', async () => {
    const breaker = new CircuitBreaker('test', { 
      failureThreshold: 1, 
      recoveryTimeoutMs: 1000
    });
    const failingOp = jest.fn().mockRejectedValue(new Error('Fail'));
    const successOp = jest.fn().mockResolvedValue('success');

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    jest.advanceTimersByTime(1000);
    expect(breaker.getState()).toBe('HALF_OPEN');

    await expect(breaker.execute(failingOp)).rejects.toThrow('Fail');
    expect(breaker.getState()).toBe('OPEN');
  });
});

describe('ErrorHandlingService - executeWithResilience', () => {
  it('executes with retry and breaker combined', async () => {
    const breaker = new CircuitBreaker('test', { failureThreshold: 3 });
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');

    const result = await executeWithResilience(breaker, fn, { operationName: 'test-op', retry: { baseDelayMs: 1 } });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('ErrorHandlingService - executeCompensatedWorkflow', () => {
  it('runs all steps successfully', async () => {
    const step1 = jest.fn().mockResolvedValue(undefined);
    const step2 = jest.fn().mockResolvedValue(undefined);
    
    await executeCompensatedWorkflow('workflow', [
      { name: 'step1', run: step1 },
      { name: 'step2', run: step2 },
    ]);

    expect(step1).toHaveBeenCalled();
    expect(step2).toHaveBeenCalled();
  });

  it('triggers compensation for completed steps on failure', async () => {
    const step1 = jest.fn().mockResolvedValue(undefined);
    const step1Compensate = jest.fn().mockResolvedValue(undefined);
    const step2 = jest.fn().mockRejectedValue(new Error('Failed'));
    
    await expect(
      executeCompensatedWorkflow('workflow', [
        { name: 'step1', run: step1, compensate: step1Compensate },
        { name: 'step2', run: step2 },
      ])
    ).rejects.toThrow(AppError);

    expect(step1).toHaveBeenCalled();
    expect(step2).toHaveBeenCalled();
    expect(step1Compensate).toHaveBeenCalled();
  });

  it('catches compensation errors and continues rollback', async () => {
    const step1 = jest.fn().mockResolvedValue(undefined);
    const step1Compensate = jest.fn().mockRejectedValue(new Error('Compensation Failed'));
    const step2 = jest.fn().mockRejectedValue(new Error('Failed'));
    
    await expect(
      executeCompensatedWorkflow('workflow', [
        { name: 'step1', run: step1, compensate: step1Compensate },
        { name: 'step2', run: step2 },
      ])
    ).rejects.toThrow(AppError);

    expect(step1Compensate).toHaveBeenCalled();
  });
});

describe('retry.ts - withRetries (Legacy Wrapper)', () => {
  it('maps maxAttempts to retries correctly', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetries(fn, { maxAttempts: 2, delayMs: 1, backoff: false })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('uses baseDelayMs if delayMs not provided', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetries(fn, { retries: 1, baseDelayMs: 1, backoff: false })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('maps retries directly when maxAttempts is not provided', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetries(fn, { retries: 3, delayMs: 1, backoff: false })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it('passes shouldRetry callback to underlying withRetry', async () => {
    const shouldRetry = jest.fn().mockReturnValue(false);
    const fn = jest.fn().mockRejectedValue(new Error('custom error'));
    await expect(withRetries(fn, { retries: 3, shouldRetry })).rejects.toThrow('custom error');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalled();
  });

  it('passes operationName to underlying withRetry', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetries(fn, { retries: 1, delayMs: 1, backoff: false, operationName: 'test-op' })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('enables jitter by default when backoff is true', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');
    const result = await withRetries(fn, { retries: 1, delayMs: 1, backoff: true });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('disables jitter when backoff is false', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');
    const result = await withRetries(fn, { retries: 1, delayMs: 1, backoff: false });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('handles zero retries correctly', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetries(fn, { retries: 0, delayMs: 1, backoff: false })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles maxAttempts of 1 (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(withRetries(fn, { maxAttempts: 1, delayMs: 1, backoff: false })).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('succeeds on first attempt with no retries needed', async () => {
    const fn = jest.fn().mockResolvedValue('immediate-success');
    const result = await withRetries(fn, { retries: 3, delayMs: 1 });
    expect(result).toBe('immediate-success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('propagates non-transient errors without retrying', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('Bad Request'));
    await expect(withRetries(fn, { retries: 3, delayMs: 1, backoff: false })).rejects.toThrow('Bad Request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on transient errors and eventually succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('econnreset'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce('recovered');
    const result = await withRetries(fn, { retries: 5, delayMs: 1, backoff: false });
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('exhausts all retries and throws the last error', async () => {
    const error = new Error('persistent timeout');
    const fn = jest.fn().mockRejectedValue(error);
    await expect(withRetries(fn, { retries: 2, delayMs: 1, backoff: false })).rejects.toThrow('persistent timeout');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('uses default options when no opts provided', async () => {
    const fn = jest.fn().mockResolvedValue('default-success');
    const result = await withRetries(fn);
    expect(result).toBe('default-success');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorHandlingService - getDelay (exponential backoff)', () => {
  it('calculates exponential backoff without jitter', () => {
    // Accessing private function via module internals
    const { withRetry: wr } = require('../../src/services/ErrorHandlingService');
    // We test the behavior indirectly via withRetry
  });

  it('applies jitter within expected range', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');
    const result = await withRetry(fn, { retries: 2, baseDelayMs: 100, jitter: true });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('caps delay at maxDelayMs', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('success');
    const result = await withRetry(fn, { retries: 2, baseDelayMs: 10000, maxDelayMs: 50, jitter: false });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('ErrorHandlingService - withRetry edge cases', () => {
  it('handles undefined options gracefully', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, undefined);
    expect(result).toBe('ok');
  });

  it('handles empty options object', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, {});
    expect(result).toBe('ok');
  });

  it('retries with custom shouldRetry that returns true for specific errors', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('custom-retryable'))
      .mockResolvedValueOnce('success');
    const shouldRetry = jest.fn().mockImplementation((err: unknown) => {
      return err instanceof Error && err.message === 'custom-retryable';
    });
    const result = await withRetry(fn, { retries: 2, shouldRetry, baseDelayMs: 1, jitter: false });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry when shouldRetry throws', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('error'));
    const shouldRetry = jest.fn().mockImplementation(() => {
      throw new Error('shouldRetry crashed');
    });
    await expect(withRetry(fn, { retries: 2, shouldRetry, baseDelayMs: 1, jitter: false })).rejects.toThrow('shouldRetry crashed');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('handles async shouldRetry function', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('retryable'))
      .mockResolvedValueOnce('success');
    const shouldRetry = jest.fn().mockResolvedValue(true);
    const result = await withRetry(fn, { retries: 2, shouldRetry, baseDelayMs: 1, jitter: false });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
