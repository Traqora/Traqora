import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type OffsetProjectType = 'reforestation' | 'renewable' | 'community';

@Entity({ name: 'offset_projects' })
export class OffsetProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 256 })
  name!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: OffsetProjectType;

  @Column({ type: 'integer' })
  pricePerTonCents!: number;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'simple-json' : 'jsonb', default: [] })
  certifications!: string[];

  @Column({ type: 'varchar', length: 128, default: 'active' })
  status!: string;

  @Column({ type: 'integer', default: 0 })
  totalOffsetTons!: number;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
