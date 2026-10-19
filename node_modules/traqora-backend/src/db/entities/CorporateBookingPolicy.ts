import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CorporateAccount } from './CorporateAccount';

export type FareClass = 'economy' | 'premium_economy' | 'business' | 'first';

@Entity({ name: 'corporate_booking_policies' })
export class CorporateBookingPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => CorporateAccount, (account) => account.bookingPolicies)
  account!: CorporateAccount;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  corporateAccountId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'integer', nullable: true })
  maxBookingAmountCents?: number | null;

  @Column({ type: 'simple-array', default: 'economy' })
  allowedFareClasses!: FareClass[];

  @Column({ type: 'integer', nullable: true })
  maxAdvanceBookingDays?: number | null;

  @Column({ type: 'boolean', default: true })
  requiresApproval!: boolean;

  @Column({ type: 'integer', nullable: true })
  approvalThresholdCents?: number | null;

  @Column({ type: 'simple-array', nullable: true })
  preferredAirlines?: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  blacklistedAirlines?: string[] | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
