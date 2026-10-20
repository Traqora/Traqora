import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PriceObservation } from './PriceObservation';

export type TrackedFlightStatus = 'active' | 'paused' | 'expired';

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

/**
 * A route + date combination a user is tracking across third-party travel
 * sites via the browser extension. Distinct from `PriceAlert`, which watches
 * a single Traqora-internal flight record.
 */
@Entity({ name: 'tracked_flights' })
@Index(['userId', 'status'])
export class TrackedFlight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 8 })
  origin!: string;

  @Column({ type: 'varchar', length: 8 })
  destination!: string;

  /** ISO date (YYYY-MM-DD) — stored as text so it stays timezone-free. */
  @Column({ type: 'varchar', length: 32 })
  departureDate!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  returnDate?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'economy' })
  cabinClass!: CabinClass;

  @Column({ type: 'integer', default: 1 })
  passengers!: number;

  /** Notify once the observed price falls to or below this, in minor units. */
  @Column({ type: 'integer', nullable: true })
  targetPriceCents?: number | null;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency!: string;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: TrackedFlightStatus;

  /** Most recent observed price across all sources, in minor units. */
  @Column({ type: 'integer', nullable: true })
  lastPriceCents?: number | null;

  /** Lowest price ever observed for this tracker, in minor units. */
  @Column({ type: 'integer', nullable: true })
  lowestPriceCents?: number | null;

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz',
    nullable: true,
  })
  lastCheckedAt?: Date | null;

  @Column({
    type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz',
    nullable: true,
  })
  lastNotifiedAt?: Date | null;

  @Column({ type: 'integer', default: 0 })
  notificationCount!: number;

  @OneToMany(() => PriceObservation, (observation) => observation.trackedFlight)
  observations?: PriceObservation[];

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
