import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { OffsetProject } from './OffsetProject';

export type OffsetPurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded';

@Entity({ name: 'carbon_offsets' })
export class CarbonOffset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  flightId!: string;

  @ManyToOne(() => OffsetProject, { eager: true })
  project!: OffsetProject;

  @Column({ type: 'varchar', length: 32 })
  projectId!: string;

  @Column({ type: 'integer' })
  amountCents!: number;

  @Column({ type: 'integer' })
  co2Kg!: number;

  @Column({ type: 'integer' })
  tonsOffset!: number;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: OffsetPurchaseStatus;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  bookingId?: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  certificateRef?: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sorobanTxHash?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
