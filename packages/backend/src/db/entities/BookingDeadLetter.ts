import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { BookingStatus } from './Booking';

/** Closed set of asynchronous booking operations that can be dead-lettered. */
export const BOOKING_DEAD_LETTER_OPERATIONS = ['CONFIRM_TRANSACTION'] as const;
export type BookingDeadLetterOperation =
  (typeof BOOKING_DEAD_LETTER_OPERATIONS)[number];

export const BOOKING_DEAD_LETTER_STATES = ['open', 'resolved'] as const;
export type BookingDeadLetterState = (typeof BOOKING_DEAD_LETTER_STATES)[number];

/**
 * Privacy-safe snapshot of the booking at the time the work was quarantined.
 * Deliberately excludes passenger identity, contact details, payment secrets,
 * and wallet addresses; only booking references that are already published to
 * operators and public chain identifiers are kept.
 */
export interface BookingDeadLetterContext {
  previousStatus: BookingStatus;
  outcome: string;
  bookingReference: string | null;
  flightId: string | null;
  sorobanTxHash: string | null;
  amountCents: number | null;
}

/**
 * Persistent quarantine for booking work that can no longer make progress
 * automatically (#1132). Operators inspect these rows and recover the booking
 * through the audited booking-recovery endpoint; resolution keeps the original
 * failure context for later investigation instead of deleting it.
 */
@Entity({ name: 'booking_dead_letters' })
@Index('idx_booking_dead_letters_state_created', ['state', 'createdAt'])
export class BookingDeadLetter {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_booking_dead_letters_booking')
  @Column({ type: 'varchar', length: 64 })
  bookingId!: string;

  @Column({ type: 'varchar', length: 64, default: 'CONFIRM_TRANSACTION' })
  operation!: BookingDeadLetterOperation;

  /** Booking status immediately after the terminal transition. */
  @Column({ type: 'varchar', length: 32 })
  bookingStatus!: BookingStatus;

  /** Number of attempts spent before the work was quarantined. */
  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  /** Human-readable terminal reason, bounded before storage. */
  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'simple-json' : 'jsonb',
    nullable: true,
  })
  context?: BookingDeadLetterContext | null;

  @Index('idx_booking_dead_letters_state')
  @Column({ type: 'varchar', length: 16, default: 'open' })
  state!: BookingDeadLetterState;

  @Column({ type: 'varchar', length: 128, nullable: true })
  resolvedBy?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  resolutionAction?: string | null;

  @Column({ type: 'text', nullable: true })
  resolutionReason?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  auditLogId?: string | null;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
