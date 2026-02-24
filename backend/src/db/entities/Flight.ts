import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'flights' })
export class Flight {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  flightNumber!: string;

  @Column({ type: 'varchar', length: 16 })
  fromAirport!: string;

  @Column({ type: 'varchar', length: 16 })
  toAirport!: string;

  @Column({ type: 'timestamptz' })
  departureTime!: Date;

  @Column({ type: 'integer', default: 0 })
  seatsAvailable!: number;

  @Column({ type: 'integer', default: 0 })
  priceCents!: number;

  @Column({ type: 'varchar', length: 128, default: '' })
  airlineSorobanAddress!: string;
}
