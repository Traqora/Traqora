import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SearchCabinClass } from './SearchHistoryEntry';

@Entity({ name: 'saved_searches' })
@Index('idx_saved_searches_user_updated_at', ['userId', 'updatedAt'])
export class SavedSearch {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 128 })
  userId!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  name!: string | null;

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

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
