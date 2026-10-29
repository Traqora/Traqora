import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Flight } from './Flight';
import { Passenger } from './Passenger';

export type BookingStatus =
  | 'created'
  | 'awaiting_payment'
  | 'payment_processing'
  | 'paid'
  | 'onchain_pending'
  | 'onchain_submitted'
  | 'confirmed'
  | 'failed'
  | 'refunded'
  | 'refund_rejected';

@Entity({ name: 'bookings' })
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey?: string | null;

  @ManyToOne(() => Flight, { eager: true })
  flight!: Flight;

  @ManyToOne(() => Passenger, { eager: true, cascade: ['insert'] })
  passenger!: Passenger;

  @Column({ type: 'varchar', length: 32, default: 'created' })
  status!: BookingStatus;

  @Column({ type: 'integer' })
  amountCents!: number;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  stripePaymentIntentId?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  stripeClientSecret?: string | null;

  @Column({ type: 'text', nullable: true })
  sorobanUnsignedXdr?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  sorobanTxHash?: string | null;

  /**
   * For fee-bump submissions, `sorobanTxHash` is the outer envelope hash and
   * this is the inner transaction hash (#923). Equal to `sorobanTxHash` for
   * ordinary transactions.
   */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  sorobanInnerTxHash?: string | null;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  sorobanFeeBumpTxHash?: string | null;

  @Column({ type: 'boolean', default: false })
  sorobanIsFeeBump!: boolean;

  /**
   * Stable, privacy-safe reference published in the transaction memo (#924).
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  bookingReference?: string | null;

  /**
   * Provider ticketing deadline. Distinct from the flight departure time (#906).
   */
  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  ticketingDeadline?: Date | null;
   * Issued airline ticket numbers, stored separately from the PNR / booking
   * reference. A confirmed reservation is not ticketed until at least one
   * number is present (#905).
   */
  @Column({ type: 'simple-json', nullable: true })
  ticketNumbers?: string[] | null;

  @Column({ type: 'bigint', nullable: true })
  sorobanBookingId?: string | null;

  @Column({ type: 'integer', default: 0 })
  contractSubmitAttempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  /** Upstream provider offer id from search, carried through confirmation (#914). */
  @Index()
  @Column({ type: 'varchar', length: 256, nullable: true })
  providerOfferId?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
