import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantMember } from '../../middleware/tenant';

@Entity({ name: 'tenants' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  slug!: string;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  contractId?: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  organizationId?: string | null;

  /** JSON array of TenantMember objects */
  @Column({ type: process.env.NODE_ENV === 'test' ? 'text' : 'jsonb', default: '[]' })
  members!: TenantMember[] | string;

  /** Tenant-specific rate limit overrides (requests per minute) */
  @Column({ type: 'integer', default: 1000 })
  rateLimitRpm!: number;

  /** Tenant-specific config blob */
  @Column({ type: process.env.NODE_ENV === 'test' ? 'text' : 'jsonb', default: '{}' })
  config!: Record<string, unknown> | string;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
