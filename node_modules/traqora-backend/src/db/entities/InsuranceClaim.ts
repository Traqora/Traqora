import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type InsuranceClaimEventType = 'medical' | 'baggage' | 'trip_cancellation' | 'other';

export type InsuranceClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';

@Entity({ name: 'insurance_claims' })
export class InsuranceClaim {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  policyId!: string;

  @Column({ type: 'varchar', length: 32 })
  eventType!: InsuranceClaimEventType;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'integer' })
  amountRequestedCents!: number;

  @Column({ type: 'integer', nullable: true })
  amountApprovedCents?: number | null;

  @Column({ type: 'varchar', length: 32, default: 'submitted' })
  status!: InsuranceClaimStatus;

  @Column({ type: 'varchar', length: 256, nullable: true })
  contactEmail?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  submittedAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
