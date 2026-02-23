import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'idempotency_keys' })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'varchar', length: 64 })
  method!: string;

  @Column({ type: 'varchar', length: 256 })
  path!: string;

  @Column({ type: 'varchar', length: 64 })
  requestHash!: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  resourceId?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
