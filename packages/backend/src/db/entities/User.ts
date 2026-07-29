import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryColumn({ type: 'varchar' })
  walletAddress: string;

  @Column({
    type: 'enum',
    enum: ['freighter', 'albedo', 'rabet'],
  })
  walletType: 'freighter' | 'albedo' | 'rabet';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ type: 'text', nullable: true })
  twoFactorSecret: string;

  @Column({ type: 'simple-array', nullable: true })
  backupCodes: string[];
}
