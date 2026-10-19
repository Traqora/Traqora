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

export type CorporateUserRole = 'admin' | 'booking_manager' | 'traveler' | 'approver';

@Entity({ name: 'corporate_users' })
export class CorporateUser {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => CorporateAccount, (account) => account.users)
  account!: CorporateAccount;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  corporateAccountId!: string;

  @Column({ type: 'varchar', length: 36 })
  userId!: string;

  @Column({ type: 'varchar', length: 32, default: 'traveler' })
  role!: CorporateUserRole;

  @Column({ type: 'varchar', length: 128, nullable: true })
  department?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  costCenter?: string | null;

  @Column({ type: 'json', nullable: true })
  permissions?: Record<string, boolean> | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
