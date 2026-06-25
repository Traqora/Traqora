import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type SharePermission = 'view' | 'comment' | 'edit';

@Entity({ name: 'dashboard_shares' })
export class DashboardShare {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** The analytics dashboard being shared (free-form identifier, e.g. "analytics/main") */
  @Index()
  @Column({ type: 'varchar', length: 256 })
  dashboardId!: string;

  /** Wallet address of the user who created the share */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  createdBy!: string;

  /** Opaque share token included in the share URL */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  shareToken!: string;

  @Column({ type: 'varchar', length: 32, default: 'view' })
  permission!: SharePermission;

  /** Restrict to specific wallet addresses (empty = anyone with the link) */
  @Column({ type: process.env.NODE_ENV === 'test' ? 'text' : 'jsonb', default: '[]' })
  allowedWallets!: string[] | string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  tenantId?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;
}
