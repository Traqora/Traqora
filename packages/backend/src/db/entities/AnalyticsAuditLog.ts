import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AnalyticsAuditAction =
  | 'analytics_access'
  | 'analytics_query'
  | 'analytics_export'
  | 'dashboard_view';

@Entity({ name: 'analytics_audit_logs' })
export class AnalyticsAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  action!: AnalyticsAuditAction;

  @Index()
  @Column({ type: 'varchar', length: 256 })
  route!: string;

  @Column({ type: 'varchar', length: 16 })
  method!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  actorId?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  actorEmail?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'unknown' })
  actorType!: 'admin' | 'user' | 'anonymous' | 'system';

  @Column({ type: 'varchar', length: 128, nullable: true })
  tenantId?: string | null;

  @Column({ type: 'text', nullable: true })
  queryParams?: string | null;

  @Column({ type: 'text', nullable: true })
  metadata?: string | null;

  @Column({ type: 'integer', nullable: true })
  statusCode?: number | null;

  @Column({ type: 'integer', nullable: true })
  durationMs?: number | null;

  @Column({ type: 'varchar', length: 64, default: 'unknown' })
  ipAddress!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  userAgent?: string | null;

  @Index()
  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;
}
