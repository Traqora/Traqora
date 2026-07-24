import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GroupBooking } from './GroupBooking';
import { Flight } from './Flight';

@Entity({ name: 'group_booking_flights' })
export class GroupBookingFlight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @ManyToOne(() => GroupBooking, (groupBooking) => groupBooking.flights)
  groupBooking!: GroupBooking;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  groupBookingId!: string;

  @ManyToOne(() => Flight, { eager: true })
  flight!: Flight;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  flightId!: string;

  @Column({ type: 'integer', default: 1 })
  sequenceOrder!: number;

  @Column({ type: 'varchar', length: 32, default: 'outbound' })
  flightType!: 'outbound' | 'return' | 'connecting';

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
