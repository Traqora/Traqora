import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { BadRequestError } from '../../utils/errors';
import { DocumentManagementService } from '../../services/document-management';
import { DocumentType } from '../../db/entities/TravelDocument';

const router = Router();
const documentService = new DocumentManagementService();

// ─── Validation schemas ────────────────────────────────────────────────────

const DOCUMENT_TYPES: DocumentType[] = [
  'passport',
  'national_id',
  'drivers_license',
  'visa',
  'residence_permit',
  'other',
];

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const createDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [DocumentType, ...DocumentType[]]),
  documentNumber: z.string().min(1).max(64),
  fullName: z.string().min(1).max(256),
  issuingCountry: z.string().min(2).max(64),
  nationality: z.string().min(2).max(64).optional(),
  dateOfBirth: isoDateString.optional(),
  expiryDate: isoDateString,
  issueDate: isoDateString.optional(),
  isPrimary: z.boolean().optional(),
});

const updateDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES as [DocumentType, ...DocumentType[]]).optional(),
  documentNumber: z.string().min(1).max(64).optional(),
  fullName: z.string().min(1).max(256).optional(),
  issuingCountry: z.string().min(2).max(64).optional(),
  nationality: z.string().min(2).max(64).optional(),
  dateOfBirth: isoDateString.optional(),
  expiryDate: isoDateString.optional(),
  issueDate: isoDateString.optional(),
  isPrimary: z.boolean().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/documents
 * List all travel documents for the authenticated user (masked sensitive data).
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user!.walletAddress;
    const documents = await documentService.listDocuments(walletAddress);
    return res.json({ success: true, data: documents, total: documents.length });
  }),
);

/**
 * GET /api/v1/documents/:id
 * Get a single document — returns full (decrypted) data to the owner.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user!.walletAddress;
    const doc = await documentService.getDocument(req.params.id, walletAddress);

    // Return all fields except internal soft-delete fields
    const { isDeleted, deletedAt, ...safeDoc } = doc as any;
    return res.json({ success: true, data: safeDoc });
  }),
);

/**
 * POST /api/v1/documents
 * Create a new travel document.
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const walletAddress = req.user!.walletAddress;
    const summary = await documentService.createDocument({
      walletAddress,
      ...parsed.data,
    });

    return res.status(201).json({ success: true, data: summary });
  }),
);

/**
 * PATCH /api/v1/documents/:id
 * Update a travel document.
 */
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Validation error', parsed.error.flatten());
    }

    const walletAddress = req.user!.walletAddress;
    const summary = await documentService.updateDocument(
      req.params.id,
      walletAddress,
      parsed.data,
    );

    return res.json({ success: true, data: summary });
  }),
);

/**
 * DELETE /api/v1/documents/:id
 * Soft-delete a travel document (GDPR-compliant).
 */
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user!.walletAddress;
    await documentService.deleteDocument(req.params.id, walletAddress);
    return res.json({ success: true, message: 'Document deleted successfully' });
  }),
);

export const documentRoutes = router;
