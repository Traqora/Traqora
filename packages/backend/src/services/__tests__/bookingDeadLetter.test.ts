/**
 * Booking dead-letter store (#1132) — regression tests.
 *
 * Covers safe capture of exhausted booking work, idempotent capture while an
 * entry is open, listing filters, and resolution bookkeeping.
 */

import { EntityManager } from 'typeorm';
import { Booking } from '../../db/entities/Booking';
import { BookingDeadLetter } from '../../db/entities/BookingDeadLetter';
import {
  BookingDeadLetterListFilter,
  BookingDeadLetterRepository,
  BookingDeadLetterService,
  MAX_BOOKING_DEAD_LETTER_REASON_LENGTH,
  resolveOpenBookingDeadLetters,
} from '../bookingDeadLetterService';

function booking(overrides: Record<string, unknown> = {}): Booking {
  return {
    id: 'booking-1',
    status: 'failed',
    sorobanTxHash: 'tx-1',
    bookingReference: 'TRQ-123',
    amountCents: 50000,
    lastError: 'Confirmation retries exhausted after 3 attempts',
    flight: { id: 'flight-1' },
    passenger: {
      id: 'passenger-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      passportNumber: 'P1234567',
    },
    stripePaymentIntentId: 'pi_secret',
    stripeClientSecret: 'pi_secret_client',
    ...overrides,
  } as unknown as Booking;
}

class FakeRepository implements BookingDeadLetterRepository {
  readonly entries: BookingDeadLetter[] = [];
  private sequence = 0;

  create(data: Partial<BookingDeadLetter>): BookingDeadLetter {
    return Object.assign(new BookingDeadLetter(), data);
  }

  findOpen(
    bookingId: string,
    operation: BookingDeadLetter['operation'],
  ): Promise<BookingDeadLetter | null> {
    return Promise.resolve(
      this.entries.find(
        (entry) =>
          entry.bookingId === bookingId &&
          entry.operation === operation &&
          entry.state === 'open',
      ) ?? null,
    );
  }

  findById(id: string): Promise<BookingDeadLetter | null> {
    return Promise.resolve(
      this.entries.find((entry) => entry.id === id) ?? null,
    );
  }

  list(
    filter: BookingDeadLetterListFilter = {},
  ): Promise<{ entries: BookingDeadLetter[]; total: number }> {
    const limit = Math.max(1, Math.trunc(filter.limit ?? 50));
    const offset = Math.max(0, Math.trunc(filter.offset ?? 0));
    const rows = this.entries
      .filter(
        (entry) =>
          (!filter.state || entry.state === filter.state) &&
          (!filter.bookingId || entry.bookingId === filter.bookingId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return Promise.resolve({
      entries: rows.slice(offset, offset + limit),
      total: rows.length,
    });
  }

  save(entry: BookingDeadLetter): Promise<BookingDeadLetter> {
    if (!entry.id) entry.id = `dead-letter-${++this.sequence}`;
    if (!entry.createdAt) entry.createdAt = new Date();
    entry.updatedAt = new Date();
    const index = this.entries.findIndex((row) => row.id === entry.id);
    if (index >= 0) this.entries[index] = entry;
    else this.entries.push(entry);
    return Promise.resolve(entry);
  }

  find(options: {
    where: { bookingId: string; state: string };
  }): Promise<BookingDeadLetter[]> {
    return Promise.resolve(
      this.entries.filter(
        (entry) =>
          entry.bookingId === options.where.bookingId &&
          entry.state === options.where.state,
      ),
    );
  }
}

describe('BookingDeadLetterService (#1132)', () => {
  let repository: FakeRepository;
  let service: BookingDeadLetterService;

  beforeEach(() => {
    repository = new FakeRepository();
    service = new BookingDeadLetterService({ repository });
  });

  it('captures a privacy-safe snapshot of exhausted confirmation work', async () => {
    const target = booking();

    const entry = await service.capture({
      booking: target,
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'Confirmation retries exhausted after 3 attempts',
    });

    expect(entry).toMatchObject({
      bookingId: 'booking-1',
      operation: 'CONFIRM_TRANSACTION',
      bookingStatus: 'failed',
      attempts: 3,
      state: 'open',
      reason: 'Confirmation retries exhausted after 3 attempts',
    });
    expect(entry.context).toEqual({
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      bookingReference: 'TRQ-123',
      flightId: 'flight-1',
      sorobanTxHash: 'tx-1',
      amountCents: 50000,
    });

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain('ada@example.com');
    expect(serialized).not.toContain('Ada');
    expect(serialized).not.toContain('Lovelace');
    expect(serialized).not.toContain('passport');
    expect(serialized).not.toContain('pi_secret');
  });

  it('updates an existing open entry instead of creating duplicates', async () => {
    const target = booking();
    const first = await service.capture({
      booking: target,
      previousStatus: 'onchain_submitted',
      outcome: 'error',
      attempts: 2,
      reason: 'RPC timeout',
    });
    const second = await service.capture({
      booking: target,
      previousStatus: 'onchain_submitted',
      outcome: 'error',
      attempts: 3,
      reason: 'RPC still unavailable',
    });

    expect(second.id).toBe(first.id);
    expect(repository.entries).toHaveLength(1);
    expect(second.attempts).toBe(3);
    expect(second.reason).toBe('RPC still unavailable');
  });

  it('creates a new entry after the previous one was resolved', async () => {
    const target = booking();
    const first = await service.capture({
      booking: target,
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'exhausted',
    });
    first.state = 'resolved';
    await repository.save(first);

    const second = await service.capture({
      booking: target,
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'exhausted again',
    });

    expect(second.id).not.toBe(first.id);
    expect(repository.entries).toHaveLength(2);
  });

  it('bounds the stored reason to the documented maximum', async () => {
    const reason = 'x'.repeat(MAX_BOOKING_DEAD_LETTER_REASON_LENGTH + 50);

    const entry = await service.capture({
      booking: booking(),
      previousStatus: 'onchain_submitted',
      outcome: 'error',
      attempts: 3,
      reason,
    });

    expect(entry.reason).toHaveLength(MAX_BOOKING_DEAD_LETTER_REASON_LENGTH);
    expect(entry.reason?.endsWith('…')).toBe(true);
  });

  it('lists entries with state and booking filters and a bounded page', async () => {
    await service.capture({
      booking: booking({ id: 'booking-a' }),
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'a',
    });
    const resolved = await service.capture({
      booking: booking({ id: 'booking-b' }),
      previousStatus: 'onchain_submitted',
      outcome: 'failed',
      attempts: 1,
      reason: 'b',
    });
    resolved.state = 'resolved';
    await repository.save(resolved);

    const open = await service.list({ state: 'open' });
    expect(open.total).toBe(1);
    expect(open.entries[0].bookingId).toBe('booking-a');

    const byBooking = await service.list({ bookingId: 'booking-b' });
    expect(byBooking.total).toBe(1);
    expect(byBooking.entries[0].state).toBe('resolved');

    const page = await service.list({ limit: 1, offset: 1 });
    expect(page.entries).toHaveLength(1);
    expect(page.total).toBe(2);
  });

  it('counts open entries for operational visibility', async () => {
    expect(await service.countOpen()).toBe(0);

    await service.capture({
      booking: booking({ id: 'booking-a' }),
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'a',
    });

    expect(await service.countOpen()).toBe(1);
  });
});

describe('resolveOpenBookingDeadLetters (#1132)', () => {
  it('records the acting admin, action, audit reference and resolution time', async () => {
    const repository = new FakeRepository();
    const service = new BookingDeadLetterService({ repository });
    const entry = await service.capture({
      booking: booking(),
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'exhausted',
    });

    const manager = {
      getRepository: () => repository,
    } as unknown as EntityManager;
    const resolvedAt = new Date('2026-01-01T00:00:00.000Z');

    const count = await resolveOpenBookingDeadLetters(manager, {
      bookingId: 'booking-1',
      adminId: 'admin-1',
      action: 'retry_confirmation',
      reason: 'RPC recovered',
      auditLogId: 'audit-1',
      resolvedAt,
    });

    expect(count).toBe(1);
    expect(entry.state).toBe('resolved');
    expect(entry.resolvedBy).toBe('admin-1');
    expect(entry.resolutionAction).toBe('retry_confirmation');
    expect(entry.resolutionReason).toBe('RPC recovered');
    expect(entry.auditLogId).toBe('audit-1');
    expect(entry.resolvedAt).toBe(resolvedAt);
  });

  it('leaves already-resolved entries untouched', async () => {
    const repository = new FakeRepository();
    const service = new BookingDeadLetterService({ repository });
    const entry = await service.capture({
      booking: booking(),
      previousStatus: 'onchain_submitted',
      outcome: 'left_pending',
      attempts: 3,
      reason: 'exhausted',
    });
    entry.state = 'resolved';
    entry.resolvedBy = 'admin-old';
    await repository.save(entry);

    const manager = {
      getRepository: () => repository,
    } as unknown as EntityManager;

    const count = await resolveOpenBookingDeadLetters(manager, {
      bookingId: 'booking-1',
      adminId: 'admin-new',
      action: 'mark_failed',
      reason: 'late',
      auditLogId: 'audit-2',
    });

    expect(count).toBe(0);
    expect(entry.resolvedBy).toBe('admin-old');
    expect(entry.auditLogId).toBeUndefined();
  });
});
