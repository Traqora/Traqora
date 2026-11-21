import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('flight_followers')
export class FlightFollower {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar' })
  userId: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  flightId: string; // references Flight.id

  @Column({ type: 'varchar', length: 32 })
  flightNumber: string;

  @Column({ type: 'varchar', length: 10 })
  airlineCode: string;

  @Column({ type: 'boolean', default: true })
  notificationsEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;
}