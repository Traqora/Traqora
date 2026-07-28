import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TrackedFlight } from './TrackedFlight';

/**
 * A single price sighting reported by the browser extension (or an internal
 * poller) for a tracked route. Immutable — the history is append-only.
 */
@Entity({ name: 'price_observations' })
@Index(['trackedFlightId', 'observedAt'])
export class PriceObservation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  trackedFlightId!: string;

  @ManyToOne(() => TrackedFlight, (tracked) => tracked.observations, {
    onDelete: 'CASCADE',
  })
  trackedFlight?: TrackedFlight;

  @Column({ type: 'integer' })
  priceCents!: number;

  @Column({ type: 'varchar', length: 8, default: 'USD' })
  currency!: string;

  /** Hostname the price was scraped from, e.g. "www.kayak.com". */
  @Index()
  @Column({ type: 'varchar', length: 255 })
  source!: string;

  @Column({ type: 'text', nullable: true })
  sourceUrl?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  carrierCode?: string | null;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  observedAt!: Date;
}
