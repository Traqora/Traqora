import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Entity({ name: 'booking_approvals' })
export class BookingApproval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  groupBookingId!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  corporateAccountId?: string | null;

  @Column({ type: 'varchar', length: 36 })
  requestedBy!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  approverId?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: ApprovalStatus;

  @Column({ type: 'text', nullable: true })
  requestReason?: string | null;

  @Column({ type: 'text', nullable: true })
  approvalNote?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvalDate?: Date | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
