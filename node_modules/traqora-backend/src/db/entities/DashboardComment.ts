import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type CommentTarget = 'dashboard' | 'chart' | 'datapoint';

@Entity({ name: 'dashboard_comments' })
export class DashboardComment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 256 })
  dashboardId!: string;

  /** e.g. "chart:revenue-bar" or "datapoint:revenue-bar:2024-01" */
  @Column({ type: 'varchar', length: 256, nullable: true })
  target?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'dashboard' })
  targetType!: CommentTarget;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  authorWallet!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  authorName?: string | null;

  @Column({ type: 'text' })
  body!: string;

  /** Optional reply thread: points to parent comment id */
  @Column({ type: 'varchar', length: 36, nullable: true })
  parentId?: string | null;

  /** Resolved/dismissed state */
  @Column({ type: 'boolean', default: false })
  resolved!: boolean;

  @Column({ type: 'varchar', length: 128, nullable: true })
  tenantId?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
