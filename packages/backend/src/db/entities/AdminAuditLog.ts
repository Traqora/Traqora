import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from 'typeorm';

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

    @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
    createdAt!: Date;
}
