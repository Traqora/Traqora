import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Booking } from './Booking';

export type RefundStatus =
  | 'pending'
  | 'eligibility_check'
  | 'approved'
  | 'rejected'
  | 'processing'
  | 'stripe_refunded'
  | 'onchain_pending'
  | 'onchain_submitted'
  | 'completed'
  | 'failed'
  | 'manual_review';

export type RefundReason =
  | 'flight_cancelled'
  | 'flight_delayed'
  | 'customer_request'
  | 'duplicate_booking'
  | 'service_issue'
  | 'other';

@Entity({ name: 'refunds' })
export class Refund {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Booking, { eager: true })
  @Index()
  booking!: Booking;

  @Column({ type: 'varchar', length: 32 })
  status!: RefundStatus;

  @Column({ type: 'varchar', length: 64 })
  reason!: RefundReason;

  @Column({ type: 'text', nullable: true })
  reasonDetails?: string | null;

  @Column({ type: 'integer' })
  requestedAmountCents!: number;

  @Column({ type: 'integer', nullable: true })
  approvedAmountCents?: number | null;

  @Column({ type: 'integer', default: 0 })
  processingFeeCents!: number;

  @Column({ type: 'boolean', default: false })
  isEligible!: boolean;

  @Column({ type: 'text', nullable: true })
  eligibilityNotes?: string | null;

  @Column({ type: 'boolean', default: false })
  requiresManualReview!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reviewedBy?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  stripeRefundId?: string | null;

  @Column({ type: 'text', nullable: true })
  sorobanUnsignedXdr?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  sorobanTxHash?: string | null;

  @Column({ type: 'integer', default: 0 })
  contractSubmitAttempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  requestedBy?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
