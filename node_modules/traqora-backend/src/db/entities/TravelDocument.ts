import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptionTransformer } from '../../utils/encryption';

export type DocumentType =
  | 'passport'
  | 'national_id'
  | 'drivers_license'
  | 'visa'
  | 'residence_permit'
  | 'other';

export type DocumentVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'expired';

@Entity({ name: 'travel_documents' })
export class TravelDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Owner — references the users.walletAddress PK */
  @Index()
  @Column({ type: 'varchar', length: 128 })
  walletAddress!: string;

  @Column({ type: 'varchar', length: 32 })
  documentType!: DocumentType;

  /** Encrypted document number (AES-256-GCM) */
  @Column({ type: 'text', transformer: encryptionTransformer })
  documentNumber!: string;

  /** Encrypted full name on document */
  @Column({ type: 'text', transformer: encryptionTransformer })
  fullName!: string;

  /** Encrypted issuing country (ISO 3166-1 alpha-2) */
  @Column({ type: 'text', transformer: encryptionTransformer })
  issuingCountry!: string;

  /** Encrypted nationality */
  @Column({ type: 'text', nullable: true, transformer: encryptionTransformer })
  nationality?: string | null;

  /** Encrypted date of birth (ISO string) */
  @Column({ type: 'text', nullable: true, transformer: encryptionTransformer })
  dateOfBirth?: string | null;

  /** Plain-text expiry date — used for expiry tracking queries; stored as ISO date string */
  @Index()
  @Column({ type: 'varchar', length: 32 })
  expiryDate!: string;

  /** Plain-text issue date — stored as ISO date string */
  @Column({ type: 'varchar', length: 32, nullable: true })
  issueDate?: string | null;

  @Column({ type: 'varchar', length: 32, default: 'unverified' })
  verificationStatus!: DocumentVerificationStatus;

  @Column({ type: 'text', nullable: true })
  verificationNotes?: string | null;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ type: 'boolean', default: false })
  isPrimary!: boolean;

  /** Soft-delete: GDPR right-to-erasure support */
  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;

  @Column({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz', nullable: true })
  deletedAt?: Date | null;

  @CreateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz' })
  updatedAt!: Date;
}
