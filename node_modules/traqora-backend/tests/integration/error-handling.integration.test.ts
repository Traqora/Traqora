import { describe, expect, it } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/utils/errorHandler';
import {
  AppError,
  CircuitBreaker,
  executeCompensatedWorkflow,
  executeWithResilience,
} from '../../src/services/ErrorHandlingService';
import { withRetries } from '../../src/services/retry';
import { requestLogger } from '../../src/middleware/requestLogger';

describe('error handling resilience', () => {
  it('returns standardized error payload with retry hints', async () => {
    const app = express();
    app.use(requestLogger);

    app.get('/boom', (_req, _res, next) => {
      next(
        new AppError('Upstream unavailable', {
          statusCode: 503,
          code: 'UPSTREAM_UNAVAILABLE',
          retryable: true,
          retryAfterMs: 12000,
          details: { dependency: 'soroban' },
        })
      );
    });

    app.use(errorHandler);

    const response = await request(app).get('/boom');
    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UPSTREAM_UNAVAILABLE');
    expect(response.body.error.retryable).toBe(true);
    expect(response.body.error.retryAfterMs).toBe(12000);
    expect(response.body.error.requestId).toBeTruthy();
    expect(response.body.error.timestamp).toBeTruthy();
    expect(response.headers['retry-after']).toBe('12');
  });

  it('retries transient timeout failures and then succeeds', async () => {
    let attempts = 0;

    const result = await withRetries(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('network timeout while calling soroban rpc');
        }
        return 'ok';
      },
      {
        retries: 4,
        baseDelayMs: 1,
        backoff: false,
      }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('retries transient 500 errors and succeeds', async () => {
    let attempts = 0;

    const result = await withRetries(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          const error = new Error('service unavailable') as Error & {
            response?: { status: number };
          };
          error.response = { status: 500 };
          throw error;
        }
        return { ok: true };
      },
      { retries: 3, baseDelayMs: 1, backoff: false }
    );

    expect(result.ok).toBe(true);
    expect(attempts).toBe(3);
  });

  it('opens circuit after 5 consecutive failures and short-circuits subsequent requests', async () => {
    const breaker = new CircuitBreaker('test-upstream', {
      failureThreshold: 5,
      recoveryTimeoutMs: 60_000,
    });

    for (let i = 0; i < 5; i += 1) {
      await expect(
        executeWithResilience(
          breaker,
          async () => {
            throw new Error('upstream timeout');
          },
          {
            operationName: 'test_upstream_call',
            retry: { retries: 0 },
          }
        )
      ).rejects.toThrow();
    }

    await expect(
      executeWithResilience(
        breaker,
        async () => 'ok',
        {
          operationName: 'test_upstream_call',
          retry: { retries: 0 },
        }
      )
    ).rejects.toMatchObject({ code: 'CIRCUIT_OPEN', statusCode: 503 });
  });

  it('runs compensation steps after partial workflow failure', async () => {
    const sideEffects: string[] = [];

    await expect(
      executeCompensatedWorkflow('booking_payment_confirmation', [
        {
          name: 'reserve_seat',
          run: async () => {
            sideEffects.push('seat_reserved');
          },
          compensate: async () => {
            sideEffects.push('seat_released');
          },
        },
        {
          name: 'capture_payment',
          run: async () => {
            sideEffects.push('payment_captured');
          },
          compensate: async () => {
            sideEffects.push('payment_refunded');
          },
        },
        {
          name: 'confirm_onchain',
          run: async () => {
            throw new Error('soroban timeout');
          },
        },
      ])
    ).rejects.toMatchObject({
      code: 'PARTIAL_FAILURE_RECOVERED',
      statusCode: 503,
      retryable: true,
    });

    expect(sideEffects).toEqual([
      'seat_reserved',
      'payment_captured',
      'payment_refunded',
      'seat_released',
    ]);
  });
});
