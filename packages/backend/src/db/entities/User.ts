import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar' })
  walletAddress: string;

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'varchar' : 'enum',
    enum: ['freighter', 'albedo', 'rabet'],
  })
  walletType: 'freighter' | 'albedo' | 'rabet';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  twoFactorSecret: string;

  @Column({ type: 'simple-array', nullable: true })
  backupCodes: string[];

  // Notification preferences
  @Column({ type: 'varchar', nullable: true })
  emailAddress: string;

  @Column({ type: 'varchar', nullable: true })
  phoneNumber: string;

  @Column({ type: 'boolean', default: true })
  notificationsEnabled: boolean;

  @Column({ type: 'simple-json', nullable: true })
  notificationPreferences: Record<string, any>;
}
