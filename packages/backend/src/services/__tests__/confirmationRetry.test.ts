/**
 * Bounded confirmation retry worker (#1131) — regression tests.
 *
 * Covers the pure decision function (normal, transient, exhausted, definitive
 * failure), the persisted retry state, batch processing, and the in-process
 * retry loop used after a booking is submitted.
 */

import { Booking } from '../../db/entities/Booking';
import { ConfirmBookingTxResult } from '../bookingConfirmRetry';
import {
  computeConfirmationBackoff,
  ConfirmationRetryPolicy,
  ConfirmationRetryRepository,
  ConfirmationRetryService,
  decideConfirmationRetry,
} from '../confirmationRetry';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const policy: ConfirmationRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 4000,
  jitterRatio: 0,
};

function booking(overrides: Record<string, unknown> = {}): Booking {
  return {
    id: 'booking-1',
    status: 'onchain_submitted',
    sorobanTxHash: 'tx-1',
    confirmationAttempts: 0,
    confirmationNextAttemptAt: null,
    lastError: null,
    flight: { id: 'flight-1', seatsAvailable: 3 },
    ...overrides,
  } as unknown as Booking;
}

function confirmResult(
  outcome: ConfirmBookingTxResult['outcome'],
  target: Booking,
  changed = false,
): ConfirmBookingTxResult {
  return {
    outcome,
    changed,
    booking: target,
    transactionStatus: null,
  };
}

class FakeRepository implements ConfirmationRetryRepository {
  readonly bookings = new Map<string, Booking>();
  readonly saves: Booking[] = [];
  due: string[] = [];

  async findDue(): Promise<Booking[]> {
    return this.due
      .map((id) => this.bookings.get(id))
      .filter((entry): entry is Booking => Boolean(entry));
  }

  async findById(id: string): Promise<Booking | null> {
    return this.bookings.get(id) ?? null;
  }

  async save(entity: Booking): Promise<Booking> {
    this.saves.push(entity);
    this.bookings.set(entity.id, entity);
    return entity;
  }
}

describe('decideConfirmationRetry (#1131 contract)', () => {
  it('resets retry state when the transaction confirms', () => {
    const decision = decideConfirmationRetry({
      currentAttempts: 2,
      status: 'onchain_submitted',
      outcome: 'confirmed',
      policy,
      now: NOW,
    });

    expect(decision).toMatchObject({
      status: 'confirmed',
      attempts: 0,
      nextAttemptAt: null,
      terminal: false,
      settled: true,
    });
  });

  it('treats an already-confirmed replay as settled without consuming attempts', () => {
    const decision = decideConfirmationRetry({
      currentAttempts: 1,
      status: 'confirmed',
      outcome: 'already_confirmed',
      policy,
      now: NOW,
    });

    expect(decision.status).toBe('confirmed');
    expect(decision.attempts).toBe(0);
    expect(decision.terminal).toBe(false);
  });

  it('fails immediately on a definitive on-chain failure', () => {
    const decision = decideConfirmationRetry({
      currentAttempts: 0,
      status: 'onchain_submitted',
      outcome: 'failed',
      reason: 'insufficient budget',
      policy,
      now: NOW,
    });

    expect(decision).toMatchObject({
      status: 'failed',
      attempts: 1,
      nextAttemptAt: null,
      lastError: 'insufficient budget',
      terminal: true,
    });
  });

  it('schedules a pending transaction with exponential backoff', () => {
    const decision = decideConfirmationRetry({
      currentAttempts: 0,
      status: 'onchain_submitted',
      outcome: 'left_pending',
      policy,
      now: NOW,
    });

    expect(decision.status).toBe('onchain_submitted');
    expect(decision.attempts).toBe(1);
    expect(decision.nextAttemptAt?.getTime()).toBe(NOW.getTime() + 1000);
    expect(decision.terminal).toBe(false);
  });

  it('moves to a visible terminal failure once the attempt budget is spent', () => {
    const decision = decideConfirmationRetry({
      currentAttempts: 2,
      status: 'onchain_submitted',
      outcome: 'left_pending',
      policy,
      now: NOW,
    });

    expect(decision.status).toBe('failed');
    expect(decision.attempts).toBe(3);
    expect(decision.nextAttemptAt).toBeNull();
    expect(decision.terminal).toBe(true);
    expect(decision.lastError).toContain('exhausted after 3 attempts');
  });

  it('counts transport errors against the same bounded budget', () => {
    const decision = decideConfirmationRetry({
      currentAttempts: 2,
      status: 'onchain_submitted',
      outcome: 'error',
      reason: 'RPC timeout',
      policy,
      now: NOW,
    });

    expect(decision.status).toBe('failed');
    expect(decision.terminal).toBe(true);
    expect(decision.lastError).toContain('RPC timeout');
  });

  it('caps the exponential backoff at the policy maximum', () => {
    expect(computeConfirmationBackoff(1, policy)).toBe(1000);
    expect(computeConfirmationBackoff(2, policy)).toBe(2000);
    expect(computeConfirmationBackoff(10, policy)).toBe(4000);
  });
});

describe('ConfirmationRetryService (#1131)', () => {
  let repository: FakeRepository;
  let broadcast: jest.Mock;
  let releaseSeat: jest.Mock;
  let captureDeadLetter: jest.Mock;

  beforeEach(() => {
    repository = new FakeRepository();
    broadcast = jest.fn();
    releaseSeat = jest.fn(async () => undefined);
    captureDeadLetter = jest.fn(async () => undefined);
  });

  function createService(confirm: jest.Mock, overrides: Record<string, unknown> = {}) {
    return new ConfirmationRetryService({
      repository,
      confirm,
      policy,
      now: () => NOW,
      sleep: jest.fn(async () => undefined),
      broadcast,
      releaseSeat,
      captureDeadLetter,
      random: () => 0,
      ...overrides,
    });
  }

  it('normal path: persists the confirmed transition and resets retry state', async () => {
    const target = booking({ status: 'onchain_submitted' });
    repository.bookings.set(target.id, target);
    const confirm = jest.fn(async () => {
      target.status = 'confirmed';
      return confirmResult('confirmed', target, true);
    });

    const result = await createService(confirm).processBooking(target.id);

    expect(result.skipped).toBe(false);
    expect(result.decision.status).toBe('confirmed');
    expect(target.status).toBe('confirmed');
    expect(target.confirmationAttempts).toBe(0);
    expect(target.confirmationNextAttemptAt).toBeNull();
    expect(repository.saves).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledWith(target);
    expect(releaseSeat).not.toHaveBeenCalled();
    expect(captureDeadLetter).not.toHaveBeenCalled();
  });

  it('pending path: persists attempts and the next backoff time without failing', async () => {
    const target = booking();
    repository.bookings.set(target.id, target);
    const confirm = jest.fn(async () => confirmResult('left_pending', target));

    const result = await createService(confirm).processBooking(target.id);

    expect(result.decision.status).toBe('onchain_submitted');
    expect(target.status).toBe('onchain_submitted');
    expect(target.confirmationAttempts).toBe(1);
    expect(target.confirmationNextAttemptAt?.getTime()).toBe(NOW.getTime() + 1000);
    expect(broadcast).not.toHaveBeenCalled();
    expect(captureDeadLetter).not.toHaveBeenCalled();
  });

  it('exhausted path: transitions to a terminal failed state with a clear reason', async () => {
    const target = booking({ confirmationAttempts: 2 });
    repository.bookings.set(target.id, target);
    const confirm = jest.fn(async () => confirmResult('left_pending', target));

    const result = await createService(confirm).processBooking(target.id);

    expect(result.decision.terminal).toBe(true);
    expect(target.status).toBe('failed');
    expect(target.confirmationAttempts).toBe(3);
    expect(target.confirmationNextAttemptAt).toBeNull();
    expect(target.lastError).toContain('Confirmation retries exhausted');
    expect(broadcast).toHaveBeenCalledWith(target);
    expect(captureDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: target,
        previousStatus: 'onchain_submitted',
        outcome: 'left_pending',
        attempts: 3,
        reason: expect.stringContaining('Confirmation retries exhausted'),
      }),
    );
  });

  it('definitive failure: marks failed immediately and releases the seat once', async () => {
    const target = booking();
    repository.bookings.set(target.id, target);
    const confirm = jest.fn(async () => {
      target.status = 'failed';
      target.lastError = 'insufficient budget';
      return confirmResult('failed', target, true);
    });

    const result = await createService(confirm).processBooking(target.id);

    expect(result.decision.terminal).toBe(true);
    expect(target.status).toBe('failed');
    expect(target.lastError).toBe('insufficient budget');
    expect(target.confirmationNextAttemptAt).toBeNull();
    expect(releaseSeat).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith(target);
    expect(captureDeadLetter).toHaveBeenCalledWith(
      expect.objectContaining({
        booking: target,
        previousStatus: 'onchain_submitted',
        outcome: 'failed',
        attempts: 1,
        reason: 'insufficient budget',
      }),
    );
  });

  it('treats thrown confirmation errors as retryable attempts', async () => {
    const target = booking({ confirmationAttempts: 2 });
    repository.bookings.set(target.id, target);
    const confirm = jest.fn(async () => {
      throw new Error('RPC unavailable');
    });

    const result = await createService(confirm).processBooking(target.id);

    expect(result.decision.terminal).toBe(true);
    expect(target.status).toBe('failed');
    expect(target.lastError).toContain('RPC unavailable');
  });

  it('does not fail the attempt when dead-letter capture fails', async () => {
    const target = booking({ confirmationAttempts: 2 });
    repository.bookings.set(target.id, target);
    captureDeadLetter.mockRejectedValueOnce(new Error('dead-letter store down'));
    const confirm = jest.fn(async () => confirmResult('left_pending', target));

    const result = await createService(confirm).processBooking(target.id);

    expect(result.decision.terminal).toBe(true);
    expect(target.status).toBe('failed');
  });

  it('skips bookings without a transaction hash', async () => {
    const target = booking({ sorobanTxHash: null });
    repository.bookings.set(target.id, target);
    const confirm = jest.fn();

    const result = await createService(confirm).processBooking(target.id);

    expect(result.skipped).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    expect(repository.saves).toHaveLength(0);
  });

  it('runDueBatch processes only due bookings and summarises outcomes', async () => {
    const pending = booking({ id: 'pending', confirmationAttempts: 0 });
    const confirmed = booking({ id: 'confirmed', confirmationAttempts: 1 });
    const failed = booking({ id: 'failed', confirmationAttempts: 2 });
    repository.bookings.set(pending.id, pending);
    repository.bookings.set(confirmed.id, confirmed);
    repository.bookings.set(failed.id, failed);
    repository.due = [pending.id, confirmed.id, failed.id];

    const confirm = jest.fn(async (id: string) => {
      if (id === 'confirmed') {
        confirmed.status = 'confirmed';
        return confirmResult('confirmed', confirmed, true);
      }
      if (id === 'failed') {
        return confirmResult('left_pending', failed);
      }
      return confirmResult('left_pending', pending);
    });

    const summary = await createService(confirm).runDueBatch();

    expect(summary.scanned).toBe(3);
    expect(summary.attempted).toBe(3);
    expect(summary.confirmed).toBe(1);
    expect(summary.scheduled).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it('retryUntilSettled keeps retrying until confirmation and honours backoff', async () => {
    const target = booking();
    repository.bookings.set(target.id, target);
    let calls = 0;
    const confirm = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return confirmResult('left_pending', target);
      }
      target.status = 'confirmed';
      return confirmResult('confirmed', target, true);
    });
    const sleep = jest.fn(async () => undefined);
    const service = createService(confirm, { sleep });

    const result = await service.retryUntilSettled(target.id);

    expect(result?.decision.status).toBe('confirmed');
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(target.confirmationAttempts).toBe(0);
  });
});
