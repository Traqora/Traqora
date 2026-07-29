import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Booking } from './Booking';
import { User } from './User';

export type ReviewStatus = 'pending' | 'approved' | 'rejected';

@Entity({ name: 'reviews' })
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  airlineCode!: string;

  @Index()
  @ManyToOne(() => Booking, { eager: true })
  booking!: Booking;

  @Index()
  @ManyToOne(() => User, { eager: true })
  user!: User;

  @Column({ type: 'integer', default: 0 })
  rating!: number; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  title?: string | null;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({ type: 'varchar', length: 64, default: 'pending' })
  status!: ReviewStatus;

  @Column({ type: 'boolean', default: false })
  isVerified!: boolean; // Only true if booking is confirmed

  @Column({ type: 'json', nullable: true })
  pros?: string[] | null; // List of pros

  @Column({ type: 'json', nullable: true })
  cons?: string[] | null; // List of cons

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}