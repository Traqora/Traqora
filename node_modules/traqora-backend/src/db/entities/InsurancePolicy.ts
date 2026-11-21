import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type InsuranceCoverageType = 'basic' | 'standard' | 'premium';

export type InsurancePolicyStatus = 'active' | 'refunded' | 'cancelled' | 'expired';

export interface InsuranceCoverageDetails {
  medicalCents: number;
  baggageCents: number;
  tripCancellationCents: number;
}

@Entity({ name: 'insurance_policies' })
export class InsurancePolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  bookingId!: string;

  @Column({ type: 'varchar', length: 3 })
  destination!: string;

  @Column({ type: 'integer' })
  tripCostCents!: number;

  @Column({ type: 'varchar', length: 16, default: 'standard' })
  coverageType!: InsuranceCoverageType;

  @Column({ type: 'integer' })
  premiumCents!: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency!: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: InsurancePolicyStatus;

  @Column({ type: 'varchar', length: 64, default: 'mock-global-shield' })
  provider!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  providerPolicyRef!: string;

  @Column({ type: 'text' })
  coverageDetailsJson!: string;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  purchasedAt!: Date;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  refundEligibleUntil!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
