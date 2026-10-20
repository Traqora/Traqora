import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SearchCabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

@Entity({ name: 'search_history_entries' })
@Index('idx_search_history_user_created_at', ['userId', 'createdAt'])
export class SearchHistoryEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 3 })
  fromAirport!: string;

  @Column({ type: 'varchar', length: 3 })
  toAirport!: string;

  @Column({ type: 'date' })
  departureDate!: string;

  @Column({ type: 'integer', default: 1 })
  passengers!: number;

  @Column({ type: 'varchar', length: 32, default: 'economy' })
  cabinClass!: SearchCabinClass;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;
}
