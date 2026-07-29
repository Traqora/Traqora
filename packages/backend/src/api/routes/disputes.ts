import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { disputeService } from '../../services/dispute/disputeService';

const router = Router();

const createDisputeSchema = z.object({
  refundId: z.string().uuid(),
  disputeType: z.enum(['refund_denied', 'refund_amount', 'processing_delay', 'service_quality', 'other']),
  description: z.string().min(20).max(2000),
  desiredOutcome: z.string().min(10).max(500),
  evidence: z
    .array(
      z.object({
        description: z.string().min(3).max(500),
        fileUrl: z.string().max(2048).optional(),
      }),
    )
    .max(10)
    .optional(),
});

const submitEvidenceSchema = z.object({
  description: z.string().min(5).max(1000),
  fileUrl: z.string().max(2048).optional(),
});

const resolveSchema = z.object({
  outcome: z.enum(['claimant_wins', 'respondent_wins', 'partial']),
  notes: z.string().max(2000).optional(),
});

const appealSchema = z.object({
  reason: z.string().min(20).max(2000),
});

const getErrorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : 'Unexpected dispute workflow error';

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createDisputeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    try {
      const dispute = await disputeService.createDispute({
        refundId: parsed.data.refundId,
        claimantAddress: walletAddress,
        disputeType: parsed.data.disputeType,
        description: parsed.data.description,
        desiredOutcome: parsed.data.desiredOutcome,
        evidence: parsed.data.evidence,
      });
      return res.status(201).json(dispute);
    } catch (err: unknown) {
      return res.status(400).json({ error: getErrorMessage(err) });
    }
  }),
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    const items = await disputeService.listDisputesByAddress(walletAddress);
    return res.json({ items, total: items.length });
  }),
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    const dispute = await disputeService.getDispute(req.params.id);
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const authorized =
      dispute.claimantAddress === walletAddress ||
      dispute.respondentAddress === walletAddress ||
      dispute.arbitratorAddress === walletAddress;

    if (!authorized) return res.status(403).json({ error: 'Forbidden' });
    return res.json(dispute);
  }),
);

router.post(
  '/:id/evidence',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = submitEvidenceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    try {
      const dispute = await disputeService.submitEvidence({
        disputeId: req.params.id,
        submittedBy: walletAddress,
        description: parsed.data.description,
        fileUrl: parsed.data.fileUrl,
      });
      return res.json(dispute);
    } catch (err: unknown) {
      return res.status(400).json({ error: getErrorMessage(err) });
    }
  }),
);

router.post(
  '/:id/resolve',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    try {
      const dispute = await disputeService.resolveDispute({
        disputeId: req.params.id,
        arbitratorAddress: walletAddress,
        outcome: parsed.data.outcome,
        notes: parsed.data.notes,
      });
      return res.json(dispute);
    } catch (err: unknown) {
      return res.status(400).json({ error: getErrorMessage(err) });
    }
  }),
);

router.post(
  '/:id/appeal',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = appealSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const walletAddress = req.user?.walletAddress;
    if (!walletAddress) return res.status(401).json({ error: 'Wallet address required' });

    try {
      const dispute = await disputeService.appealDispute({
        disputeId: req.params.id,
        appellantAddress: walletAddress,
        reason: parsed.data.reason,
      });
      return res.json(dispute);
    } catch (err: unknown) {
      return res.status(400).json({ error: getErrorMessage(err) });
    }
  }),
);

export default router;
