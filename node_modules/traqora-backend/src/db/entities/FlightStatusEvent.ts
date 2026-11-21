import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type FlightEventType =
  | 'DELAYED'
  | 'ON_TIME'
  | 'CANCELLED'
  | 'GATE_CHANGED'
  | 'BOARDING'
  | 'DEPARTED'
  | 'LANDED'
  | 'DIVERTED'
  | 'SCHEDULED_UPDATED';

@Entity('flight_status_events')
export class FlightStatusEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  flightId: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  flightNumber: string;

  @Column({ type: 'varchar', length: 32 })
  eventType: FlightEventType;

  @Column({ type: 'varchar', length: 256, nullable: true })
  message?: string;

  @Column({ type: 'integer', default: 0 })
  delayMinutes?: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  previousGate?: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  newGate?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  previousTerminal?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  newTerminal?: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  cancellationReason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}