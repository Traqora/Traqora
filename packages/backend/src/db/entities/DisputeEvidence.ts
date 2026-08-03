import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Dispute } from './Dispute';

@Entity({ name: 'dispute_evidence' })
export class DisputeEvidence {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Dispute, (dispute) => dispute.evidenceItems, { onDelete: 'CASCADE' })
  @Index()
  dispute!: Dispute;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  submittedBy!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'text', nullable: true })
  fileUrl?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  submittedAt!: Date;
}
