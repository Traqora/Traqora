import { handlePaymentCallback, validateWalletNetwork } from '../src/services/payment';
import { Request, Response } from 'express';

describe('Payment Service v1', () => {
  test('payment callbacks are idempotent', async () => {
    const req = { body: { eventId: 'evt-123' } } as unknown as Request;
    let statusCode = 0;
    let jsonResponse: any;
    const res = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            jsonResponse = data;
          }
        };
      }
    } as unknown as Response;

    await handlePaymentCallback(req, res);
    expect(statusCode).toBe(200);
    expect(jsonResponse.status).toBe('success');

    // Second call with same eventId should be idempotent
    await handlePaymentCallback(req, res);
    expect(statusCode).toBe(200);
    expect(jsonResponse.status).toBe('already_processed');
  });

  test('validate wallet network blocks wrong network', async () => {
    await expect(validateWalletNetwork('PUBLIC', 'TESTNET')).rejects.toThrow('Invalid network');
    await expect(validateWalletNetwork('TESTNET', 'TESTNET')).resolves.toBe(true);
  });
});
