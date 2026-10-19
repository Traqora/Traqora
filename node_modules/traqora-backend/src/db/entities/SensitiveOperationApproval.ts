import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';

export type OperationType =
    | 'payment_processing'
    | 'refund_processing'
    | 'booking_modification'
    | 'booking_cancellation'
    | 'bulk_data_export'
    | 'user_data_deletion'
    | 'admin_privilege_escalation'
    | 'api_key_creation'
    | 'configuration_change';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

@Entity({ name: 'sensitive_operation_approvals' })
export class SensitiveOperationApproval {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column({ type: 'varchar', length: 128, nullable: true })
    requesterId?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    requesterEmail?: string | null;

    @Index()
    @Column({ type: 'varchar', length: 128, nullable: true })
    approverId?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    approverEmail?: string | null;

    @Index()
    @Column({ type: 'enum', enum: [
        'payment_processing',
        'refund_processing',
        'booking_modification',
        'booking_cancellation',
        'bulk_data_export',
        'user_data_deletion',
        'admin_privilege_escalation',
        'api_key_creation',
        'configuration_change'
    ] })
    operationType!: OperationType;

    @Column({ type: 'varchar', length: 64, nullable: true })
    resource?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    resourceId?: string | null;

    @Column({ type: 'text', nullable: true })
    operationDetails?: string | null;

    @Column({ type: 'jsonb', nullable: true })
    operationMetadata?: any;

    @Column({ type: 'text', nullable: true })
    justification?: string | null;

    @Index()
    @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'cancelled'] })
    status!: ApprovalStatus;

    @Column({ type: 'text', nullable: true })
    rejectionReason?: string | null;

    @Column({ type: 'varchar', length: 64, default: 'unknown' })
    requesterIpAddress!: string;

    @Column({ type: 'varchar', length: 256, nullable: true })
    requesterUserAgent?: string | null;

    @Column({ type: 'varchar', length: 64, default: 'unknown' })
    approverIpAddress!: string;

    @Column({ type: 'varchar', length: 256, nullable: true })
    approverUserAgent?: string | null;

    @Column({ type: 'integer', default: 1 })
    requiredApprovals!: number;

    @Column({ type: 'integer', default: 0 })
    currentApprovals!: number;

    @Column({ type: 'timestamptz', nullable: true })
    expiresAt?: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    approvedAt?: Date | null;

    @Column({ type: 'timestamptz', nullable: true })
    rejectedAt?: Date | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    relatedAuditLogId?: string | null;

    @Column({ type: 'boolean', default: false })
    isArchived!: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    archivedAt?: Date | null;

    @Index()
    @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    createdAt!: Date;

    @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    updatedAt!: Date;

    /**
     * Check if approval has expired
     */
    isExpired(): boolean {
        return this.expiresAt ? new Date() > this.expiresAt : false;
    }

    /**
     * Check if approval is fully approved
     */
    isFullyApproved(): boolean {
        return this.currentApprovals >= this.requiredApprovals;
    }

    /**
     * Check if approval can still be acted upon
     */
    isActive(): boolean {
        return this.status === 'pending' && !this.isExpired();
    }
}
