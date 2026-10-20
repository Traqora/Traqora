/**
 * Stellar Expert API routes — issue #728.
 *
 * Provides endpoints for on-chain transaction tracking and
 * sanity verification against Stellar Expert.
 *
 * Scope:
 *   GET /api/v1/stellar-expert/status/:txId   — Fetch tx status
 *   GET /api/v1/stellar-expert/metrics/:contractId — Contract metrics
 *   POST /api/v1/stellar-expert/verify         — On-chain sanity check
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/authMiddleware';
import { asyncHandler } from '../../utils/errorHandler';
import { stellarExpertMetricsService } from '../../services/analytics/stellarExpertMetrics';

const router = Router();

const verifySchema = z.object({
  txId: z.string().min(1),
  expectedStatus: z.string().optional(),
  expectedLedger: z.coerce.number().int().nonnegative().optional(),
});

/**
 * GET /api/v1/stellar-expert/status/:txId
 * Fetch transaction status from Stellar Expert.
 */
router.get(
  '/status/:txId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { txId } = req.params;
    const status = await stellarExpertMetricsService.getTxStatus(txId);
    return res.json(status);
  })
);

/**
 * GET /api/v1/stellar-expert/metrics/:contractId
 * Compute contract-level metrics from on-chain data.
 * Query params: txIds (comma-separated list of transaction IDs)
 */
router.get(
  '/metrics/:contractId',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { contractId } = req.params;
    const { txIds } = req.query;

    if (!txIds || typeof txIds !== 'string') {
      return res.status(400).json({ error: 'txIds query parameter (comma-separated) is required' });
    }

    const idList = txIds.split(',').map((s: string) => s.trim()).filter(Boolean);
    if (idList.length === 0) {
      return res.status(400).json({ error: 'At least one txId is required' });
    }

    const metrics = await stellarExpertMetricsService.computeContractMetrics(contractId, idList);
    return res.json(metrics);
  })
);

/**
 * POST /api/v1/stellar-expert/verify
 * Verify on-chain transaction against expected state.
 */
router.post(
  '/verify',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { txId, expectedStatus, expectedLedger } = parsed.data;
    const result = await stellarExpertMetricsService.verifyOnChainSanity(txId, expectedStatus, expectedLedger);
    return res.json(result);
  })
);

export const stellarExpertRoutes = router;
