import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Booking } from './Booking';

export type CheckInStatus = 'pending' | 'checked_in' | 'cancelled';

@Entity({ name: 'check_ins' })
export class CheckIn {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => Booking, { eager: true })
  booking!: Booking;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: CheckInStatus;

  @Column({ type: 'varchar', length: 16, nullable: true })
  seatNumber?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  boardingPassCode!: string;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  checkedInAt?: Date | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
