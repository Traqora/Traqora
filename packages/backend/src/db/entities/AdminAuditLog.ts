import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { createHash } from 'crypto';

@Entity({ name: 'admin_audit_logs' })
export class AdminAuditLog {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Index()
    @Column({ type: 'varchar', length: 128 })
    adminId!: string;

    @Column({ type: 'varchar', length: 128 })
    adminEmail!: string;

    @Column({ type: 'varchar', length: 64 })
    action!: string;

    @Column({ type: 'varchar', length: 64 })
    resource!: string;

    @Column({ type: 'varchar', length: 128, nullable: true })
    resourceId?: string | null;

    @Column({ type: 'text', nullable: true })
    details?: string | null;

    @Column({ type: 'varchar', length: 64, default: 'unknown' })
    ipAddress!: string;

    @Column({ type: 'varchar', length: 128, nullable: true })
    userAgent?: string | null;

    @Column({ type: 'varchar', length: 64, nullable: true })
    sessionId?: string | null;

    @Index()
    @Column({ type: 'varchar', length: 128, nullable: true })
    previousLogHash?: string | null;

    @Column({ type: 'varchar', length: 128, nullable: false })
    logHash!: string;

    @Column({ type: 'boolean', default: false })
    isArchived!: boolean;

    @Column({ type: 'timestamptz', nullable: true })
    archivedAt?: Date | null;

    @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    createdAt!: Date;

    /**
     * Generate hash for tamper-evident chain
     * Hash includes: id, adminId, action, resource, resourceId, details, ipAddress, createdAt, previousLogHash
     */
    generateLogHash(previousHash: string | null = null): string {
        const data = `${this.id}|${this.adminId}|${this.action}|${this.resource}|${this.resourceId || ''}|${this.details || ''}|${this.ipAddress}|${this.createdAt.toISOString()}|${previousHash || ''}`;
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
