import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DeletionRequestStatus = 'pending' | 'cancelled' | 'completed';

/**
 * A user-initiated GDPR/CCPA right-to-deletion request (issue #386).
 * Kept as its own row (never overwritten) so there is a durable audit
 * trail of every request, even across multiple pending/cancelled cycles.
 */
@Entity('account_deletion_requests')
export class AccountDeletionRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string; // walletAddress

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: DeletionRequestStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  requestedAt: Date;
}
