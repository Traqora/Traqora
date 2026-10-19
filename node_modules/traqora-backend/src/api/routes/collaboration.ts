import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../utils/errorHandler';
import { requireAuth } from '../../middleware/authMiddleware';
import { tenantMiddleware } from '../../middleware/tenant';
import {
  createComment,
  listComments,
  resolveComment,
  deleteComment,
  createShare,
  resolveShareToken,
  listShares,
  revokeShare,
  getActivityFeed,
} from '../../db/comments';

const router = Router();

router.use(requireAuth, tenantMiddleware);

// ── Shares ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/collaboration/shares
 * Create a share link for a dashboard.
 */
router.post(
  '/shares',
  asyncHandler(async (req: Request, res: Response) => {
    const { dashboardId, permission, allowedWallets, expiresInDays } = req.body as {
      dashboardId?: string;
      permission?: string;
      allowedWallets?: string[];
      expiresInDays?: number;
    };

    if (!dashboardId) {
      return res.status(400).json({ success: false, error: 'dashboardId is required' });
    }

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : undefined;

    const share = await createShare({
      dashboardId,
      createdBy: req.user!.walletAddress,
      permission: (permission as 'view' | 'comment' | 'edit') ?? 'view',
      allowedWallets: allowedWallets ?? [],
      expiresAt,
      tenantId: req.tenantId,
    });

    return res.status(201).json({ success: true, data: share });
  })
);

/**
 * GET /api/v1/collaboration/shares?dashboardId=...
 * List shares for a dashboard.
 */
router.get(
  '/shares',
  asyncHandler(async (req: Request, res: Response) => {
    const { dashboardId } = req.query as { dashboardId?: string };
    if (!dashboardId) {
      return res.status(400).json({ success: false, error: 'dashboardId query param is required' });
    }
    const shares = await listShares(dashboardId, req.user!.walletAddress);
    return res.json({ success: true, data: shares });
  })
);

/**
 * GET /api/v1/collaboration/shares/resolve/:token
 * Resolve a share token to its dashboard metadata (public — no auth required).
 */
router.get(
  '/shares/resolve/:token',
  asyncHandler(async (req: Request, res: Response) => {
    const share = await resolveShareToken(req.params.token);
    if (!share) {
      return res.status(404).json({ success: false, error: 'Share not found or expired' });
    }

    const allowedWallets = Array.isArray(share.allowedWallets)
      ? share.allowedWallets
      : (JSON.parse(share.allowedWallets as string) as string[]);

    if (allowedWallets.length > 0) {
      const viewer = req.user?.walletAddress;
      if (!viewer || !allowedWallets.includes(viewer)) {
        return res.status(403).json({ success: false, error: 'You are not on the allowed list for this share.' });
      }
    }

    return res.json({ success: true, data: share });
  })
);

/**
 * DELETE /api/v1/collaboration/shares/:id
 * Revoke a share (owner only).
 */
router.delete(
  '/shares/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const ok = await revokeShare(req.params.id, req.user!.walletAddress);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Share not found or you are not the owner.' });
    }
    return res.json({ success: true });
  })
);

// ── Comments ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/collaboration/comments?dashboardId=...&target=...
 */
router.get(
  '/comments',
  asyncHandler(async (req: Request, res: Response) => {
    const { dashboardId, target } = req.query as { dashboardId?: string; target?: string };
    if (!dashboardId) {
      return res.status(400).json({ success: false, error: 'dashboardId query param is required' });
    }
    const comments = await listComments(dashboardId, { target, tenantId: req.tenantId });
    return res.json({ success: true, data: comments });
  })
);

/**
 * POST /api/v1/collaboration/comments
 * Add a comment to a dashboard or chart.
 */
router.post(
  '/comments',
  asyncHandler(async (req: Request, res: Response) => {
    const { dashboardId, target, targetType, body, parentId } = req.body as {
      dashboardId?: string;
      target?: string;
      targetType?: string;
      body?: string;
      parentId?: string;
    };

    if (!dashboardId || !body?.trim()) {
      return res.status(400).json({ success: false, error: 'dashboardId and body are required' });
    }

    const comment = await createComment({
      dashboardId,
      target,
      targetType: (targetType as 'dashboard' | 'chart' | 'datapoint') ?? 'dashboard',
      authorWallet: req.user!.walletAddress,
      body: body.trim(),
      parentId,
      tenantId: req.tenantId,
    });

    return res.status(201).json({ success: true, data: comment });
  })
);

/**
 * PATCH /api/v1/collaboration/comments/:id/resolve
 */
router.patch(
  '/comments/:id/resolve',
  asyncHandler(async (req: Request, res: Response) => {
    const ok = await resolveComment(req.params.id, req.user!.walletAddress);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Comment not found or you are not the author.' });
    }
    return res.json({ success: true });
  })
);

/**
 * DELETE /api/v1/collaboration/comments/:id
 */
router.delete(
  '/comments/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const ok = await deleteComment(req.params.id, req.user!.walletAddress);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Comment not found or you are not the author.' });
    }
    return res.json({ success: true });
  })
);

// ── Activity Feed ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/collaboration/activity?dashboardId=...&limit=...
 */
router.get(
  '/activity',
  asyncHandler(async (req: Request, res: Response) => {
    const { dashboardId, limit } = req.query as { dashboardId?: string; limit?: string };
    if (!dashboardId) {
      return res.status(400).json({ success: false, error: 'dashboardId query param is required' });
    }
    const feed = await getActivityFeed(dashboardId, req.tenantId, limit ? parseInt(limit, 10) : 50);
    return res.json({ success: true, data: feed });
  })
);

export const collaborationRoutes = router;
