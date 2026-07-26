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

  @Column({ type: 'varchar', length: 512, nullable: true, transformer: encryptionTransformer })
  middleName?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  title?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  suffix?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  dateOfBirth?: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  nationality?: string | null;

  @Column({ type: 'varchar', length: 128, default: '' })
  sorobanAddress!: string;
}
