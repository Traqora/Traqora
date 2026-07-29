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
}
