/**
 * Cancellation confirmation and idempotency guards (issues #1150 and #1151).
 * Unit tests only: the repository is stubbed so no database is needed.
 */
import { BadRequestError, ConflictError } from '../../src/utils/errors';
import {
  assertCancellationConfirmation,
  CANCELLATION_TERMS_VERSION,
  CancellationConfirmation,
} from '../../src/services/cancellationConfirmation';
import {
  runOnceByIdempotencyKey,
  IdempotencyRepo,
} from '../../src/services/cancellationIdempotency';
import type { CancellationRefund } from '../../src/services/fareRulesService';
import type { IdempotencyKey } from '../../src/db/entities/IdempotencyKey';

const quote = (netRefundCents: number): CancellationRefund => ({
  refundableCents: netRefundCents,
  penaltyCents: 0,
  netRefundCents,
  currency: 'USD',
  breakdown: [],
  refundPercentage: 100,
  daysToDeparture: 10,
  eligible: true,
});

const confirmation = (overrides: Partial<CancellationConfirmation> = {}): CancellationConfirmation => ({
  confirm: true,
  termsVersion: CANCELLATION_TERMS_VERSION,
  expectedNetRefundCents: 15000,
  ...overrides,
});

describe('assertCancellationConfirmation (#1150)', () => {
  const refund = quote(15000);

  it('accepts a confirmation that matches the quoted terms', () => {
    expect(() => assertCancellationConfirmation(refund, confirmation())).not.toThrow();
  });

  it('rejects a request without explicit confirmation', () => {
    expect(() =>
      assertCancellationConfirmation(refund, confirmation({ confirm: false as true })),
    ).toThrow(BadRequestError);
  });

  it('rejects a stale terms version', () => {
    expect(() =>
      assertCancellationConfirmation(refund, confirmation({ termsVersion: 'v0' })),
    ).toThrow(BadRequestError);
  });

  it('rejects a negative or non-integer expected refund', () => {
    expect(() =>
      assertCancellationConfirmation(refund, confirmation({ expectedNetRefundCents: -1 })),
    ).toThrow(BadRequestError);
    expect(() =>
      assertCancellationConfirmation(refund, confirmation({ expectedNetRefundCents: 1.5 })),
    ).toThrow(BadRequestError);
  });

  it('rejects a refund amount that changed since the traveler reviewed the terms', () => {
    expect(() =>
      assertCancellationConfirmation(quote(12000), confirmation()),
    ).toThrow(ConflictError);
  });
});

describe('runOnceByIdempotencyKey (#1151)', () => {
  const params = {
    key: 'cancel-key-1',
    method: 'POST',
    path: '/api/v1/bookings/abc/cancel',
    requestHash: 'hash-1',
  };

  const makeRepo = (existing?: Partial<IdempotencyKey>): IdempotencyRepo => {
    const record = existing as IdempotencyKey | undefined;
    return {
      findOne: jest.fn().mockResolvedValue(record ?? null),
      create: jest.fn((value: Partial<IdempotencyKey>) => ({ ...value }) as IdempotencyKey),
      save: jest.fn(async (value: IdempotencyKey) => value),
    } as unknown as IdempotencyRepo;
  };

  it('executes the cancellation once and stores the response', async () => {
    const repo = makeRepo();
    const execute = jest.fn().mockResolvedValue({ success: true, refund: quote(15000) });

    const first = await runOnceByIdempotencyKey(repo, params, execute);
    expect(first.idempotent).toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledTimes(1);

    const saved = (repo.save as jest.Mock).mock.calls[0][0] as IdempotencyKey;
    expect(saved.responseBody).toContain('15000');
  });

  it('replays the stored response without executing again', async () => {
    const stored = {
      ...params,
      responseBody: JSON.stringify({ success: true, refund: quote(15000) }),
    };
    const repo = makeRepo(stored);
    const execute = jest.fn().mockResolvedValue({ success: true });

    const replay = await runOnceByIdempotencyKey(repo, params, execute);
    expect(replay.idempotent).toBe(true);
    expect(replay.result).toEqual({ success: true, refund: quote(15000) });
    expect(execute).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects the same key reused with a different payload', async () => {
    const repo = makeRepo({ ...params, requestHash: 'different-hash' });
    const execute = jest.fn();

    await expect(runOnceByIdempotencyKey(repo, params, execute)).rejects.toThrow(ConflictError);
    expect(execute).not.toHaveBeenCalled();
  });

  it('does not store a response when the cancellation throws', async () => {
    const repo = makeRepo();
    const execute = jest.fn().mockRejectedValue(new Error('supplier unavailable'));

    await expect(runOnceByIdempotencyKey(repo, params, execute)).rejects.toThrow(
      'supplier unavailable',
    );
    expect(repo.save).not.toHaveBeenCalled();
  });
});
