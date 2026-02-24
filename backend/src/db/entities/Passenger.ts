import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'passengers' })
export class Passenger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 128 })
  email!: string;

  @Column({ type: 'varchar', length: 64 })
  firstName!: string;

  @Column({ type: 'varchar', length: 64 })
  lastName!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 128, default: '' })
  sorobanAddress!: string;
}
