import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { disputeService } from '../../services/dispute/disputeService';

const router = Router();

const createDisputeSchema = z.object({
  bookingId: z.string().uuid(),
  description: z.string().min(20).max(2000),
});

const submitEvidenceSchema = z.object({
  description: z.string().min(5).max(1000),
  fileUrl: z.string().url().optional(),
});

const resolveSchema = z.object({
  outcome: z.enum(['claimant_wins', 'respondent_wins', 'partial']),
  notes: z.string().max(2000).optional(),
});

/**
 * POST /api/disputes
 * Open a new dispute for a booking.
 */
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createDisputeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = (req as any).user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    const dispute = await disputeService.createDispute({
      bookingId: parsed.data.bookingId,
      claimantAddress: walletAddress,
      description: parsed.data.description,
    });

    return res.status(201).json(dispute);
  }),
);

/**
 * GET /api/disputes
 * List disputes for the authenticated wallet.
 */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = (req as any).user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    const items = await disputeService.listDisputesByAddress(walletAddress);
    return res.json({ items, total: items.length });
  }),
);

/**
 * GET /api/disputes/:id
 * Get a single dispute by ID.
 */
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const dispute = await disputeService.getDispute(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    return res.json(dispute);
  }),
);

/**
 * POST /api/disputes/:id/evidence
 * Submit evidence to an open dispute.
 */
router.post(
  '/:id/evidence',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = submitEvidenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = (req as any).user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    try {
      const dispute = await disputeService.submitEvidence({
        disputeId: req.params.id,
        submittedBy: walletAddress,
        description: parsed.data.description,
        fileUrl: parsed.data.fileUrl,
      });
      return res.json(dispute);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }),
);

/**
 * POST /api/disputes/:id/resolve
 * Resolve a dispute (arbitrator only).
 */
router.post(
  '/:id/resolve',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = (req as any).user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    try {
      const dispute = await disputeService.resolveDispute({
        disputeId: req.params.id,
        arbitratorAddress: walletAddress,
        outcome: parsed.data.outcome,
        notes: parsed.data.notes,
      });
      return res.json(dispute);
    } catch (err: any) {
      return res.status(400).json({ error: err.message });
    }
  }),
);

export default router;
