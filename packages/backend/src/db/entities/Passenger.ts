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

  @Column({ type: 'boolean', default: false })
  requiresSpecialAssistance!: boolean;

  @Column({ type: 'varchar', length: 32, nullable: true })
  wheelchairType?: string | null;

  @Column({ type: 'text', nullable: true })
  wheelchairNotes?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  medicalOxygenType?: string | null;

  @Column({ type: 'integer', nullable: true })
  oxygenFlowRateLpm?: number | null;

  @Column({ type: 'integer', nullable: true })
  oxygenQuantity?: number | null;

  @Column({ type: 'text', nullable: true })
  oxygenNotes?: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  specialMealType?: string | null;

  @Column({ type: 'text', nullable: true })
  specialMealNotes?: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  serviceAnimalType?: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  serviceAnimalBreed?: string | null;

  @Column({ type: 'integer', nullable: true })
  serviceAnimalWeightKg?: number | null;

  @Column({ type: 'text', nullable: true })
  serviceAnimalNotes?: string | null;

  @Column({ type: 'boolean', default: false })
  priorityBoarding!: boolean;

  @Column({ type: 'boolean', default: false })
  extraLegroomPreferred!: boolean;

  @Column({ type: 'boolean', default: false })
  bulkheadSeatRequired!: boolean;

  @Column({ type: 'boolean', default: false })
  aisleChairRequired!: boolean;

  @Column({ type: 'boolean', default: false })
  deafOrHardOfHearing!: boolean;

  @Column({ type: 'boolean', default: false })
  blindOrLowVision!: boolean;

  @Column({ type: 'boolean', default: false })
  cognitiveAssistance!: boolean;

  @Column({ type: 'text', nullable: true })
  accessibilityNotes?: string | null;

  @Column({ type: 'text', nullable: true })
  otherNeeds?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  airlineNotifications?: object[] | null;
}
