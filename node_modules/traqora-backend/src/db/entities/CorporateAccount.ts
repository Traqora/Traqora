import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CorporateUser } from './CorporateUser';
import { CorporateBookingPolicy } from './CorporateBookingPolicy';

export type CorporateAccountStatus = 'active' | 'pending' | 'suspended' | 'closed';

@Entity({ name: 'corporate_accounts' })
export class CorporateAccount {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  companyName!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  registrationNumber?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  taxId?: string | null;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  phone?: string | null;

  @Column({ type: 'text', nullable: true })
  address?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  industry?: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  accountManagerId?: string | null;

  @Column({ type: 'integer', default: 0 })
  creditLimitCents!: number;

  @Column({ type: 'integer', default: 30 })
  paymentTermsDays!: number;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: CorporateAccountStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'json', nullable: true })
  customFields?: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', nullable: true })
  contractStartDate?: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  contractEndDate?: Date | null;

  @OneToMany(() => CorporateUser, (cu) => cu.account)
  users!: CorporateUser[];

  @OneToMany(() => CorporateBookingPolicy, (bp) => bp.account)
  bookingPolicies!: CorporateBookingPolicy[];

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
