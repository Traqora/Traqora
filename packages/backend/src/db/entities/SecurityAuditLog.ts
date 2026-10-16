import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { createHash } from 'crypto';

export type SecurityAction =
    | 'login_success'
    | 'login_failure'
    | 'logout'
    | 'password_change'
    | 'password_reset_request'
    | 'mfa_enabled'
    | 'mfa_disabled'
    | 'mfa_verification_success'
    | 'mfa_verification_failure'
    | 'account_locked'
    | 'account_unlocked'
    | 'profile_update'
    | 'email_change'
    | 'phone_change'
    | 'address_change'
    | 'payment_method_added'
    | 'payment_method_removed'
    | 'booking_created'
    | 'booking_modified'
    | 'booking_cancelled'
    | 'payment_processed'
    | 'refund_processed'
    | 'data_export_request'
    | 'data_access_request'
    | 'account_deletion_request'
    | 'consent_given'
    | 'consent_revoked'
    | 'api_key_created'
    | 'api_key_revoked'
    | 'suspicious_activity_detected';

export type ActorType = 'user' | 'admin' | 'system' | 'anonymous';

@Entity({ name: 'security_audit_logs' })
export class SecurityAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column({ type: 'varchar', length: 128, nullable: true })
    userId?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    userEmail?: string | null;

    @Index()
    @Column({ type: 'varchar', length: 128, nullable: true })
    adminId?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    adminEmail?: string | null;

    @Index()
    @Column({ type: 'enum', enum: ['user', 'admin', 'system', 'anonymous'] })
    actorType!: ActorType;

    @Index()
    @Column({ type: 'enum', enum: [
        'login_success',
        'login_failure',
        'logout',
        'password_change',
        'password_reset_request',
        'mfa_enabled',
        'mfa_disabled',
        'mfa_verification_success',
        'mfa_verification_failure',
        'account_locked',
        'account_unlocked',
        'profile_update',
        'email_change',
        'phone_change',
        'address_change',
        'payment_method_added',
        'payment_method_removed',
        'booking_created',
        'booking_modified',
        'booking_cancelled',
        'payment_processed',
        'refund_processed',
        'data_export_request',
        'data_access_request',
        'account_deletion_request',
        'consent_given',
        'consent_revoked',
        'api_key_created',
        'api_key_revoked',
        'suspicious_activity_detected'
    ] })
    action!: SecurityAction;

    @Column({ type: 'varchar', length: 64, nullable: true })
    resource?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    resourceId?: string | null;

    @Column({ type: 'text', nullable: true })
    details?: string | null;

    @Column({ type: 'jsonb', nullable: true })
    metadata?: any;

    @Column({ type: 'varchar', length: 64, default: 'unknown' })
    ipAddress!: string;

    @Column({ type: 'varchar', length: 256, nullable: true })
    userAgent?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: true })
    sessionId?: string | null;

    @Column({ type: 'varchar', length: 8, nullable: true })
    countryCode?: string | null;

    @Index()
    @Column({ type: 'varchar', length: 128, nullable: true })
    previousLogHash?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: false })
    logHash!: string;

    @Column({ type: 'boolean', default: false })
    isArchived!: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    archivedAt?: Date | null;

    @Column({ type: 'boolean', default: false })
    isFlagged!: boolean;

    @Column({ type: 'varchar', length: 64, nullable: true })
    flagReason?: string | null;

    @Index()
    @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    createdAt!: Date;

    /**
     * Generate hash for tamper-evident chain
     */
    generateLogHash(previousHash: string | null = null): string {
        const data = `${this.id}|${this.userId || ''}|${this.adminId || ''}|${this.actorType}|${this.action}|${this.resource || ''}|${this.resourceId || ''}|${this.details || ''}|${this.ipAddress}|${this.createdAt.toISOString()}|${previousHash || ''}`;
        return createHash('sha256').update(data).digest('hex');
    }

    /**
     * Verify integrity of this log entry in the chain
     */
    verifyIntegrity(previousLogHash: string | null): boolean {
        const expectedHash = this.generateLogHash(previousLogHash);
        return this.logHash === expectedHash;
    }
}
