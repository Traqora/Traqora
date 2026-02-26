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
}
