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
  | 'failed';

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

  @Column({ type: 'bigint', nullable: true })
  sorobanBookingId?: string | null;

  @Column({ type: 'integer', default: 0 })
  contractSubmitAttempts!: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
