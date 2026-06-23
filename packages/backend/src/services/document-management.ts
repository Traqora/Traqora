import { Repository } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import {
  TravelDocument,
  DocumentType,
  DocumentVerificationStatus,
} from '../db/entities/TravelDocument';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors';

/** Days before expiry at which a document is considered "expiring soon" */
const EXPIRY_WARN_DAYS = 90;

export interface CreateDocumentInput {
  walletAddress: string;
  documentType: DocumentType;
  documentNumber: string;
  fullName: string;
  issuingCountry: string;
  nationality?: string;
  dateOfBirth?: string;
  /** ISO date string YYYY-MM-DD */
  expiryDate: string;
  /** ISO date string YYYY-MM-DD */
  issueDate?: string;
  isPrimary?: boolean;
}

export interface UpdateDocumentInput {
  documentType?: DocumentType;
  documentNumber?: string;
  fullName?: string;
  issuingCountry?: string;
  nationality?: string;
  dateOfBirth?: string;
  expiryDate?: string;
  issueDate?: string;
  isPrimary?: boolean;
}

export interface DocumentSummary {
  id: string;
  documentType: DocumentType;
  /** Last 4 chars of document number — the rest is masked for listings */
  maskedDocumentNumber: string;
  fullName: string;
  issuingCountry: string;
  expiryDate: string;
  issueDate?: string | null;
  verificationStatus: DocumentVerificationStatus;
  isPrimary: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VALID_DOCUMENT_TYPES: DocumentType[] = [
  'passport',
  'national_id',
  'drivers_license',
  'visa',
  'residence_permit',
  'other',
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mask all but the last 4 characters for safe listings.
 * e.g. "AB1234567" → "XXXXX4567"
 */
function maskDocumentNumber(raw: string): string {
  if (raw.length <= 4) return '****';
  return '*'.repeat(raw.length - 4) + raw.slice(-4);
}

function toSummary(doc: TravelDocument): DocumentSummary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(doc.expiryDate);
  const warnThreshold = new Date(today);
  warnThreshold.setDate(today.getDate() + EXPIRY_WARN_DAYS);

  return {
    id: doc.id,
    documentType: doc.documentType,
    maskedDocumentNumber: maskDocumentNumber(doc.documentNumber),
    fullName: doc.fullName,
    issuingCountry: doc.issuingCountry,
    expiryDate: doc.expiryDate,
    issueDate: doc.issueDate ?? null,
    verificationStatus: doc.verificationStatus,
    isPrimary: doc.isPrimary,
    isExpired: expiry < today,
    isExpiringSoon: expiry >= today && expiry <= warnThreshold,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class DocumentManagementService {
  private get repo(): Repository<TravelDocument> {
    return AppDataSource.getRepository(TravelDocument);
  }

  /**
   * Add a new travel document for a user.
   * Sensitive fields are encrypted at rest via the TypeORM `encryptionTransformer`.
   */
  async createDocument(input: CreateDocumentInput): Promise<DocumentSummary> {
    this.validateDateString(input.expiryDate, 'expiryDate');
    if (input.issueDate) this.validateDateString(input.issueDate, 'issueDate');
    if (input.dateOfBirth) this.validateDateString(input.dateOfBirth, 'dateOfBirth');
    if (!VALID_DOCUMENT_TYPES.includes(input.documentType)) {
      throw new BadRequestError(`Invalid documentType. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
    }

    // Enforce: only one primary per user
    if (input.isPrimary) {
      await this.clearPrimaryFlag(input.walletAddress);
    }

    const doc = this.repo.create({
      walletAddress: input.walletAddress,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      fullName: input.fullName,
      issuingCountry: input.issuingCountry,
      nationality: input.nationality ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      expiryDate: input.expiryDate,
      issueDate: input.issueDate ?? null,
      isPrimary: input.isPrimary ?? false,
      verificationStatus: 'unverified',
    });

    const saved = await this.repo.save(doc);

    logger.info('travel_document_created', {
      documentId: saved.id,
      walletAddress: input.walletAddress,
      documentType: input.documentType,
    });

    return toSummary(saved);
  }

  /**
   * List all active (non-deleted) documents for a user.
   */
  async listDocuments(walletAddress: string): Promise<DocumentSummary[]> {
    const docs = await this.repo.find({
      where: { walletAddress, isDeleted: false },
      order: { isPrimary: 'DESC', createdAt: 'DESC' },
    });
    return docs.map(toSummary);
  }

  /**
   * Retrieve a single document — returns full decrypted data to the owner.
   */
  async getDocument(id: string, walletAddress: string): Promise<TravelDocument> {
    const doc = await this.findOwnedDoc(id, walletAddress);
    return doc;
  }

  /**
   * Update mutable fields on a document.
   * Resets verification status to unverified if document details change.
   */
  async updateDocument(
    id: string,
    walletAddress: string,
    input: UpdateDocumentInput,
  ): Promise<DocumentSummary> {
    const doc = await this.findOwnedDoc(id, walletAddress);

    const sensitiveFieldsChanged =
      input.documentNumber !== undefined ||
      input.fullName !== undefined ||
      input.issuingCountry !== undefined ||
      input.expiryDate !== undefined ||
      input.documentType !== undefined;

    if (input.expiryDate) this.validateDateString(input.expiryDate, 'expiryDate');
    if (input.issueDate) this.validateDateString(input.issueDate, 'issueDate');
    if (input.dateOfBirth) this.validateDateString(input.dateOfBirth, 'dateOfBirth');
    if (input.documentType && !VALID_DOCUMENT_TYPES.includes(input.documentType)) {
      throw new BadRequestError(`Invalid documentType. Must be one of: ${VALID_DOCUMENT_TYPES.join(', ')}`);
    }

    if (input.isPrimary) {
      await this.clearPrimaryFlag(walletAddress);
    }

    Object.assign(doc, {
      ...(input.documentType !== undefined && { documentType: input.documentType }),
      ...(input.documentNumber !== undefined && { documentNumber: input.documentNumber }),
      ...(input.fullName !== undefined && { fullName: input.fullName }),
      ...(input.issuingCountry !== undefined && { issuingCountry: input.issuingCountry }),
      ...(input.nationality !== undefined && { nationality: input.nationality }),
      ...(input.dateOfBirth !== undefined && { dateOfBirth: input.dateOfBirth }),
      ...(input.expiryDate !== undefined && { expiryDate: input.expiryDate }),
      ...(input.issueDate !== undefined && { issueDate: input.issueDate }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      ...(sensitiveFieldsChanged && {
        verificationStatus: 'unverified' as DocumentVerificationStatus,
        verifiedAt: null,
        verificationNotes: null,
      }),
    });

    const saved = await this.repo.save(doc);

    logger.info('travel_document_updated', {
      documentId: id,
      walletAddress,
      sensitiveFieldsChanged,
    });

    return toSummary(saved);
  }

  /**
   * Soft-delete a document (GDPR-friendly erasure placeholder).
   * The record is flagged as deleted; the encrypted PII can be scrubbed by a
   * background job in compliance with the retention policy.
   */
  async deleteDocument(id: string, walletAddress: string): Promise<void> {
    const doc = await this.findOwnedDoc(id, walletAddress);

    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await this.repo.save(doc);

    logger.info('travel_document_soft_deleted', { documentId: id, walletAddress });
  }

  /**
   * Mark a document as verified (admin / verification service use).
   * Caller is responsible for authorisation checks before invoking this.
   */
  async verifyDocument(
    id: string,
    status: 'verified' | 'rejected',
    notes?: string,
  ): Promise<DocumentSummary> {
    const doc = await this.repo.findOne({ where: { id, isDeleted: false } });
    if (!doc) throw new NotFoundError('Travel document not found');

    doc.verificationStatus = status;
    doc.verificationNotes = notes ?? null;
    doc.verifiedAt = new Date();

    const saved = await this.repo.save(doc);

    logger.info('travel_document_verification_updated', { documentId: id, status });

    return toSummary(saved);
  }

  /**
   * Return all documents expiring within `days` days across all users.
   * Intended for scheduled expiry-notification jobs.
   */
  async getExpiringDocuments(days: number): Promise<TravelDocument[]> {
    const today = new Date().toISOString().split('T')[0];
    const future = new Date();
    future.setDate(future.getDate() + days);
    const futureStr = future.toISOString().split('T')[0];

    return this.repo
      .createQueryBuilder('d')
      .where('d.isDeleted = :deleted', { deleted: false })
      .andWhere('d.expiryDate >= :today', { today })
      .andWhere('d.expiryDate <= :future', { future: futureStr })
      .getMany();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async findOwnedDoc(id: string, walletAddress: string): Promise<TravelDocument> {
    const doc = await this.repo.findOne({ where: { id, isDeleted: false } });
    if (!doc) throw new NotFoundError('Travel document not found');
    if (doc.walletAddress !== walletAddress) throw new ForbiddenError('Access denied');
    return doc;
  }

  private async clearPrimaryFlag(walletAddress: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(TravelDocument)
      .set({ isPrimary: false })
      .where('walletAddress = :walletAddress', { walletAddress })
      .andWhere('isPrimary = true')
      .execute();
  }

  private validateDateString(value: string, fieldName: string): void {
    if (!ISO_DATE_RE.test(value)) {
      throw new BadRequestError(`${fieldName} must be a valid ISO date (YYYY-MM-DD)`);
    }
    if (isNaN(Date.parse(value))) {
      throw new BadRequestError(`${fieldName} is not a valid date`);
    }
  }
}
