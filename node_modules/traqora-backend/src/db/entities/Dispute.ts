import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Refund } from './Refund';
import { DisputeEvidence } from './DisputeEvidence';

export type DisputeStatus =
  | 'open'
  | 'evidence_submission'
  | 'under_review'
  | 'resolved'
  | 'appealed'
  | 'closed';

export type DisputeOutcome = 'claimant_wins' | 'respondent_wins' | 'partial' | null;

@Entity({ name: 'disputes' })
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Refund, { eager: true })
  @Index()
  refund!: Refund;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  claimantAddress!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  respondentAddress!: string;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  arbitratorAddress?: string | null;

  @Column({ type: 'varchar', length: 64 })
  disputeType!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  desiredOutcome?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'open' })
  status!: DisputeStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  outcome?: Exclude<DisputeOutcome, null> | null;

  @Column({ type: 'text', nullable: true })
  resolutionNotes?: string | null;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  deadlineAt?: Date | null;

  @OneToMany(() => DisputeEvidence, (evidence) => evidence.dispute, { cascade: ['insert'] })
  evidenceItems!: DisputeEvidence[];

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
