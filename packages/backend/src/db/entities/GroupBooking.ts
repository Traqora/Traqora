import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GroupMember } from './GroupMember';

export type GroupBookingStatus =
  | 'pending'
  | 'inviting'
  | 'awaiting_payment'
  | 'partial_paid'
  | 'paid'
  | 'confirmed'
  | 'failed'
  | 'cancelled';

export type SplitPaymentMethod = 'equal' | 'custom' | 'percentage';

@Entity({ name: 'group_bookings' })
export class GroupBooking {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'varchar', length: 255 })
  groupName!: string;

  @Column({ type: 'varchar', length: 36 })
  flightId!: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: GroupBookingStatus;

  @Column({ type: 'integer' })
  totalAmountCents!: number;

  @Column({ type: 'integer', default: 0 })
  paidAmountCents!: number;

  @Column({ type: 'varchar', length: 32, default: 'equal' })
  splitMethod!: SplitPaymentMethod;

  @Column({ type: 'json', nullable: true })
  splitConfig?: Record<string, number> | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  organizerEmail?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  organizerWalletAddress?: string | null;

  @Column({ type: 'text', nullable: true })
  sharedItinerary?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;

  @OneToMany(() => GroupMember, (member) => member.groupBooking, {
    cascade: true,
    eager: true,
  })
  members!: GroupMember[];

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}