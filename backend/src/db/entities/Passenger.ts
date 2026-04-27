import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { encryptionTransformer } from '../../utils/encryption';

@Entity({ name: 'passengers' })
export class Passenger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 512, transformer: encryptionTransformer })
  email!: string;

  @Column({ type: 'varchar', length: 512, transformer: encryptionTransformer })
  firstName!: string;

  @Column({ type: 'varchar', length: 512, transformer: encryptionTransformer })
  lastName!: string;

  @Column({ type: 'varchar', length: 512, nullable: true, transformer: encryptionTransformer })
  phone?: string | null;

  @Column({ type: 'varchar', length: 128, default: '' })
  sorobanAddress!: string;
}
