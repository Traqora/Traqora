import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Booking } from './Booking';

export type BulkBookingStatus =
  | 'pending'
  | 'processing'
  | 'partial_completed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type BulkBookingType = 'corporate' | 'agency' | 'group' | 'custom';

@Entity({ name: 'bulk_bookings' })
export class BulkBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 32, default: 'custom' })
  type!: BulkBookingType;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: BulkBookingStatus;

  @Column({ type: 'integer' })
  totalBookings!: number;

  @Column({ type: 'integer', default: 0 })
  completedBookings!: number;

  @Column({ type: 'integer', default: 0 })
  failedBookings!: number;

  @Column({ type: 'integer' })
  totalAmountCents!: number;

  @Column({ type: 'integer', default: 0 })
  processedAmountCents!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  organizationName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactEmail?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  contactPhone?: string | null;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'text', nullable: true })
  failureReason?: string | null;

  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;

  @OneToMany(() => Booking, (booking) => booking.bulkBooking, {
    cascade: true,
  })
  bookings!: Booking[];

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
