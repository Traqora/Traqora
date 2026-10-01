/**
 * Idempotent booking confirm retry (#784) — regression tests.
 *
 * Covers
 * ------
 *   applyConfirmTransition (pure state machine):
 *     - happy path: onchain_submitted + successful tx → confirmed, id captured
 *     - idempotent replay: confirmed booking + success → no-op, no change
 *     - failure mode: failed tx → failed with reason persisted
 *     - idempotent replay: already-failed booking + failed tx → no second save
 *     - pending/not_found → left_pending, no change
 *     - parseOnChainBookingId shapes (bare id, {bookingId}, none)
 *
 *   confirmBookingTx (orchestration):
 *     - happy path persists exactly one save with confirmed + booking id
 *     - idempotent replay performs no save and no chain read? — it does read
 *       the chain once, but writes nothing
 *     - failure mode persists lastError exactly once
 *     - unknown booking → BadRequestError
 *     - booking without a tx hash → left_pending without chain access
 */

import {
  applyConfirmTransition,
  confirmBookingTx,
  parseOnChainBookingId,
  ConfirmTransitionInput,
} from '../bookingConfirmRetry';
import { BadRequestError } from '../../utils/errors';

const mockFindOne = jest.fn();
const mockSave = jest.fn();
const mockGetTransactionStatus = jest.fn();

jest.mock('../../db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn().mockReturnValue({
      findOne: (...args: unknown[]) => mockFindOne(...args),
      save: (...args: unknown[]) => mockSave(...args),
      create: jest.fn(),
    }),
  },
}));

jest.mock('../soroban', () => ({
  getTransactionStatus: (...args: unknown[]) => mockGetTransactionStatus(...args),
}));

jest.mock('../retry', () => ({
  withRetries: (fn: () => unknown) => fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const SUCCESS_TX = {
  status: 'success' as const,
  txHash: 'tx-1',
  result: '42',
};

function transitionInput(
  overrides: Partial<ConfirmTransitionInput> = {},
): ConfirmTransitionInput {
  return {
    booking: { status: 'onchain_submitted', sorobanBookingId: null },
    transactionStatus: SUCCESS_TX,
    ...overrides,
  };
}

describe('applyConfirmTransition (#784 contract)', () => {
  it('happy path: confirms an onchain_submitted booking and captures the id', () => {
    const result = applyConfirmTransition(transitionInput());

    expect(result.outcome).toBe('confirmed');
    expect(result.changed).toBe(true);
    expect(result.fromStatus).toBe('onchain_submitted');
    expect(result.toStatus).toBe('confirmed');
    expect(result.onChainBookingId).toBe('42');
  });

  it('is idempotent: an already-confirmed booking with an id is a no-op', () => {
    const result = applyConfirmTransition(
      transitionInput({
        booking: { status: 'confirmed', sorobanBookingId: '42' },
      }),
    );

    expect(result.outcome).toBe('already_confirmed');
    expect(result.changed).toBe(false);
    expect(result.toStatus).toBe('confirmed');
  });

  it('captures a late-arriving on-chain id for an already-confirmed booking', () => {
    const result = applyConfirmTransition(
      transitionInput({
        booking: { status: 'confirmed', sorobanBookingId: null },
      }),
    );

    expect(result.outcome).toBe('confirmed');
    expect(result.changed).toBe(true);
    expect(result.onChainBookingId).toBe('42');
  });

  it('FAILURE MODE: a failed tx moves the booking to failed with a reason', () => {
    const result = applyConfirmTransition(
      transitionInput({
        transactionStatus: { status: 'failed', txHash: 'tx-1', error: 'insufficient budget' },
      }),
    );

    expect(result.outcome).toBe('failed');
    expect(result.changed).toBe(true);
    expect(result.toStatus).toBe('failed');
    expect(result.reason).toBe('insufficient budget');
  });

  it('is idempotent on failure: an already-failed booking is not changed again', () => {
    const result = applyConfirmTransition(
      transitionInput({
        booking: { status: 'failed', lastError: 'original failure' },
        transactionStatus: { status: 'failed', txHash: 'tx-1', error: 'different error' },
      }),
    );

    expect(result.outcome).toBe('failed');
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('original failure');
  });

  it('leaves pending and not_found transactions untouched', () => {
    for (const status of ['pending', 'not_found'] as const) {
      const result = applyConfirmTransition(
        transitionInput({ transactionStatus: { status } }),
      );
      expect(result.outcome).toBe('left_pending');
      expect(result.changed).toBe(false);
      expect(result.toStatus).toBe('onchain_submitted');
    }
  });

  describe('parseOnChainBookingId', () => {
    it('accepts a bare id', () => {
      expect(parseOnChainBookingId('42')).toBe('42');
    });

    it('accepts an object carrying bookingId', () => {
      expect(parseOnChainBookingId({ bookingId: '7' })).toBe('7');
    });

    it('returns null for objects without bookingId, null, and empty strings', () => {
      expect(parseOnChainBookingId({})).toBeNull();
      expect(parseOnChainBookingId(null)).toBeNull();
      expect(parseOnChainBookingId('')).toBeNull();
      expect(parseOnChainBookingId(undefined)).toBeNull();
    });
  });
});

describe('confirmBookingTx (#784 orchestration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockImplementation(async (booking: unknown) => booking);
  });

  it('happy path: persists one save with confirmed status and the on-chain id', async () => {
    mockFindOne.mockResolvedValue({
      id: 'booking-1',
      status: 'onchain_submitted',
      sorobanTxHash: 'tx-1',
      sorobanBookingId: null,
      lastError: null,
    });
    mockGetTransactionStatus.mockResolvedValue(SUCCESS_TX);

    const result = await confirmBookingTx('booking-1');

    expect(result.outcome).toBe('confirmed');
    expect(result.changed).toBe(true);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].status).toBe('confirmed');
    expect(mockSave.mock.calls[0][0].sorobanBookingId).toBe('42');
  });

  it('is idempotent: re-polling a settled transaction does not save again', async () => {
    mockFindOne.mockResolvedValue({
      id: 'booking-1',
      status: 'confirmed',
      sorobanTxHash: 'tx-1',
      sorobanBookingId: '42',
      lastError: null,
    });
    mockGetTransactionStatus.mockResolvedValue(SUCCESS_TX);

    const result = await confirmBookingTx('booking-1');

    expect(result.outcome).toBe('already_confirmed');
    expect(result.changed).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('FAILURE MODE: persists lastError exactly once for a failed transaction', async () => {
    const booking = {
      id: 'booking-1',
      status: 'onchain_submitted',
      sorobanTxHash: 'tx-1',
      sorobanBookingId: null,
      lastError: null,
    };
    mockFindOne.mockResolvedValue(booking);
    mockGetTransactionStatus.mockResolvedValue({
      status: 'failed',
      txHash: 'tx-1',
      error: 'Transaction failed',
    });

    const first = await confirmBookingTx('booking-1');
    expect(first.outcome).toBe('failed');
    expect(first.changed).toBe(true);
    expect(booking.lastError).toBe('Transaction failed');
    expect(mockSave).toHaveBeenCalledTimes(1);

    // Second poll with the booking already failed — no additional write.
    mockSave.mockClear();
    const second = await confirmBookingTx('booking-1');
    expect(second.outcome).toBe('failed');
    expect(second.changed).toBe(false);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('returns BadRequestError for an unknown booking', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(confirmBookingTx('missing')).rejects.toThrow(BadRequestError);
    expect(mockGetTransactionStatus).not.toHaveBeenCalled();
  });

  it('returns left_pending without touching the chain when no tx hash exists', async () => {
    mockFindOne.mockResolvedValue({
      id: 'booking-1',
      status: 'paid',
      sorobanTxHash: null,
      sorobanBookingId: null,
      lastError: null,
    });

    const result = await confirmBookingTx('booking-1');

    expect(result.outcome).toBe('left_pending');
    expect(result.changed).toBe(false);
    expect(result.transactionStatus).toBeNull();
    expect(mockGetTransactionStatus).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });
});
