/**
 * Booking dead-letter store (#1132).
 *
 * When asynchronous booking work stops making automatic progress (for example,
 * the bounded confirmation retry worker exhausts its attempt budget) the worker
 * captures a privacy-safe snapshot here. Operators can list quarantined work and
 * recover the booking through the audited admin recovery endpoint; the entry is
 * marked `resolved` with the acting admin and audit-log reference rather than
 * being deleted, so the original failure context remains available.
 */

import { DataSource, EntityManager } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import {
  BookingDeadLetter,
  BookingDeadLetterContext,
  BookingDeadLetterOperation,
  BookingDeadLetterState,
} from '../db/entities/BookingDeadLetter';
import { logger } from '../utils/logger';

export const MAX_BOOKING_DEAD_LETTER_REASON_LENGTH = 1000;
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

export interface CaptureBookingDeadLetterInput {
  booking: Booking;
  previousStatus: Booking['status'];
  outcome: string;
  attempts: number;
  reason?: string | null;
  operation?: BookingDeadLetterOperation;
}

export interface BookingDeadLetterListFilter {
  state?: BookingDeadLetterState;
  bookingId?: string;
  limit?: number;
  offset?: number;
}

export interface BookingDeadLetterListResult {
  entries: BookingDeadLetter[];
  total: number;
}

export interface BookingDeadLetterRepository {
  create(data: Partial<BookingDeadLetter>): BookingDeadLetter;
  findOpen(
    bookingId: string,
    operation: BookingDeadLetterOperation,
  ): Promise<BookingDeadLetter | null>;
  findById(id: string): Promise<BookingDeadLetter | null>;
  list(filter: BookingDeadLetterListFilter): Promise<BookingDeadLetterListResult>;
  save(entry: BookingDeadLetter): Promise<BookingDeadLetter>;
}

export class TypeOrmBookingDeadLetterRepository
  implements BookingDeadLetterRepository
{
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  create(data: Partial<BookingDeadLetter>): BookingDeadLetter {
    return this.dataSource.getRepository(BookingDeadLetter).create(data);
  }

  async findOpen(
    bookingId: string,
    operation: BookingDeadLetterOperation,
  ): Promise<BookingDeadLetter | null> {
    return this.dataSource.getRepository(BookingDeadLetter).findOne({
      where: { bookingId, operation, state: 'open' },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<BookingDeadLetter | null> {
    return this.dataSource.getRepository(BookingDeadLetter).findOne({
      where: { id },
    });
  }

  async list(
    filter: BookingDeadLetterListFilter,
  ): Promise<BookingDeadLetterListResult> {
    const limit = Math.min(
      MAX_LIST_LIMIT,
      Math.max(1, Math.trunc(filter.limit ?? DEFAULT_LIST_LIMIT)),
    );
    const offset = Math.max(0, Math.trunc(filter.offset ?? 0));

    const qb = this.dataSource
      .getRepository(BookingDeadLetter)
      .createQueryBuilder('deadLetter')
      .orderBy('deadLetter.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (filter.state) {
      qb.andWhere('deadLetter.state = :state', { state: filter.state });
    }
    if (filter.bookingId) {
      qb.andWhere('deadLetter.bookingId = :bookingId', {
        bookingId: filter.bookingId,
      });
    }

    const [entries, total] = await qb.getManyAndCount();
    return { entries, total };
  }

  async save(entry: BookingDeadLetter): Promise<BookingDeadLetter> {
    return this.dataSource.getRepository(BookingDeadLetter).save(entry);
  }
}

export interface BookingDeadLetterServiceOptions {
  repository?: BookingDeadLetterRepository;
}

export class BookingDeadLetterService {
  private readonly repository: BookingDeadLetterRepository;

  constructor(options: BookingDeadLetterServiceOptions = {}) {
    this.repository =
      options.repository ?? new TypeOrmBookingDeadLetterRepository();
  }

  /**
   * Capture terminal asynchronous work. Re-capturing an already-open entry for
   * the same booking and operation updates it in place so a worker retry cannot
   * create duplicate quarantine rows.
   */
  async capture(
    input: CaptureBookingDeadLetterInput,
  ): Promise<BookingDeadLetter> {
    const operation = input.operation ?? 'CONFIRM_TRANSACTION';
    const booking = input.booking;
    const reason = truncateReason(
      input.reason ?? booking.lastError ?? 'Asynchronous booking work exhausted',
    );
    const context: BookingDeadLetterContext = {
      previousStatus: input.previousStatus,
      outcome: input.outcome,
      bookingReference: booking.bookingReference ?? null,
      flightId: booking.flight?.id ?? null,
      sorobanTxHash: booking.sorobanTxHash ?? null,
      amountCents: booking.amountCents ?? null,
    };

    const existing = await this.repository.findOpen(booking.id, operation);
    if (existing) {
      existing.attempts = Math.max(
        existing.attempts,
        Math.max(0, Math.trunc(input.attempts)),
      );
      existing.bookingStatus = booking.status;
      existing.reason = reason;
      existing.context = context;
      return this.repository.save(existing);
    }

    const entry = this.repository.create({
      bookingId: booking.id,
      operation,
      bookingStatus: booking.status,
      attempts: Math.max(0, Math.trunc(input.attempts)),
      reason,
      context,
      state: 'open',
    });
    return this.repository.save(entry);
  }

  async get(id: string): Promise<BookingDeadLetter | null> {
    return this.repository.findById(id);
  }

  async list(
    filter: BookingDeadLetterListFilter = {},
  ): Promise<BookingDeadLetterListResult> {
    return this.repository.list(filter);
  }

  async countOpen(): Promise<number> {
    const result = await this.repository.list({
      state: 'open',
      limit: 1,
      offset: 0,
    });
    return result.total;
  }

  /** Best-effort capture used by background workers: never throws. */
  async captureSafely(
    input: CaptureBookingDeadLetterInput,
  ): Promise<BookingDeadLetter | null> {
    try {
      return await this.capture(input);
    } catch (error) {
      logger.error('Failed to capture booking dead-letter entry', {
        bookingId: input.booking.id,
        operation: input.operation ?? 'CONFIRM_TRANSACTION',
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }
}

/**
 * Mark every open dead-letter entry for a booking as resolved. Called inside the
 * booking-recovery transaction so the audit row and quarantine resolution move
 * together.
 */
export async function resolveOpenBookingDeadLetters(
  manager: EntityManager,
  input: {
    bookingId: string;
    adminId: string;
    action: string;
    reason: string;
    auditLogId: string;
    resolvedAt?: Date;
  },
): Promise<number> {
  const repository = manager.getRepository(BookingDeadLetter);
  const entries = await repository.find({
    where: { bookingId: input.bookingId, state: 'open' },
  });

  for (const entry of entries) {
    entry.state = 'resolved';
    entry.resolvedAt = input.resolvedAt ?? new Date();
    entry.resolvedBy = input.adminId;
    entry.resolutionAction = input.action;
    entry.resolutionReason = truncateReason(input.reason);
    entry.auditLogId = input.auditLogId;
    await repository.save(entry);
  }

  return entries.length;
}

function truncateReason(reason: string): string {
  if (reason.length <= MAX_BOOKING_DEAD_LETTER_REASON_LENGTH) {
    return reason;
  }
  return `${reason.slice(0, MAX_BOOKING_DEAD_LETTER_REASON_LENGTH - 1)}…`;
}

export const bookingDeadLetterService = new BookingDeadLetterService();
