import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("notification_logs")
export class NotificationLog {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column()
  channel: string; // 'email', 'sms', 'push'

  @Column()
  type: string; // 'booking', 'reminder', 'refund'

  @Column("simple-json", { nullable: true })
  payload: Record<string, any>;

  @Column({ default: "pending" })
  status: string; // 'pending', 'sent', 'failed'

  @Column({ nullable: true })
  errorMessage: string;

  @Column({ default: 0 })
  attempts: number;

  /**
   * Optional key used for cross-channel de-duplication.
   * Two log entries sharing the same key, userId, and channel are
   * considered duplicates; only the first successful send is kept.
   */
  @Column({ nullable: true })
  idempotencyKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
