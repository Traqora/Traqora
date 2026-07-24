import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'suppressed';

@Entity({ name: 'notification_delivery_log' })
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  notificationId?: string | null; // References in_app_notifications.id if applicable

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 32 })
  notificationType!: string;

  @Index()
  @Column({ type: 'varchar', length: 16 })
  channel!: string; // 'email', 'sms', 'push', 'in_app', 'webhook'

  @Index()
  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: DeliveryStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipient?: string | null; // email address, phone number, device token, etc.

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject?: string | null; // Email subject or push title

  @Column({ type: 'text', nullable: true })
  body?: string | null; // Rendered message body

  @Column({ type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ type: 'integer', default: 3 })
  maxAttempts!: number;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  nextRetryAt?: Date | null;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  deliveredAt?: Date | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}