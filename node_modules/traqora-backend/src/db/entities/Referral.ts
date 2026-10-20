// @ts-ignore
import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User';

@Entity('referrals')
export class Referral {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar' })
  referrerId: string;

  @Column({ type: 'varchar', nullable: true })
  referrerEmail: string;

  @Column({ type: 'varchar', nullable: true })
  referredEmail: string;

  @Column({ type: 'varchar', nullable: true })
  referredWallet: string;

  @Column({ type: 'varchar', nullable: true })
  referralCode: string;

  @Column({ type: 'boolean', default: false })
  isCompleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string;

  @Column({ type: 'int', default: 0 })
  riskScore: number;

  @Column({ type: 'jsonb', nullable: true })
  fraudCheckResults: any;

  @Column({ type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ type: 'varchar', nullable: true })
  blockReason: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'referrerId' })
  referrer: User;
}
