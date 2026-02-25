import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, CreateDateColumn } from 'typeorm';

@Entity({ name: 'flights' })
export class Flight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  flightNumber!: string;

  @Index()
  @Column({ type: 'varchar', length: 10 })
  airlineCode!: string;

  @Column({ type: 'varchar', length: 16 })
  fromAirport!: string;

  @Column({ type: 'varchar', length: 16 })
  toAirport!: string;

  @Column({ type: 'timestamptz' })
  departureTime!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  arrivalTime?: Date;

  @Column({ type: 'integer', default: 0 })
  seatsAvailable!: number;

  @Column({ type: 'integer', default: 0 })
  priceCents!: number;

  @Column({ type: 'varchar', length: 128, default: '' })
  airlineSorobanAddress!: string;

  // Flight Status & Real-time Updates
  @Index()
  @Column({ type: 'varchar', length: 32, default: 'SCHEDULED' })
  status!: string; // SCHEDULED, DELAYED, CANCELLED, LANDED, etc.

  @Column({ type: 'integer', default: 0 })
  delayMinutes!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  gate?: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  cancellationReason?: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  terminal?: string;

  // Sync Metadata
  @Column({ type: 'varchar', length: 50, default: 'UNKNOWN' })
  dataSource!: string; // AMADEUS, AIRLINE_API, MANUAL, etc.

  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  lastSyncedAt?: Date;

  @Column({ type: 'varchar', length: 32, default: 'EXACT_MATCH' })
  syncStatus!: string; // EXACT_MATCH, CONFLICT, UNVERIFIED, MANUAL_OVERRIDE

  @Column({ type: 'jsonb', nullable: true })
  conflictData?: Record<string, any>; // Store conflicting data for manual review

  @Column({ type: 'integer', default: 0 })
  syncAttempts!: number;

  @Column({ type: 'varchar', length: 256, nullable: true })
  lastSyncError?: string;

  // Audit
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  rawData?: Record<string, any>; // Store raw API response for debugging
}
