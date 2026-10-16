/**
 * Two-Factor Authentication Routes
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { twoFAService } from "../../services/TwoFAService";
import { logger } from "../../utils/logger";

const router = Router();

// Schemas
const setupSchema = z.object({
  method: z.enum(["totp", "sms", "email"]),
});

const confirmSetupSchema = z.object({
  sessionId: z.string(),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

const verifySchema = z.object({
  code: z.string(),
  deviceId: z.string().optional(),
  rememberDevice: z.boolean().optional(),
  recoveryCode: z.boolean().optional(),
});

/**
 * POST /api/2fa/setup
 * Start 2FA setup process
 */
router.post(
  "/setup",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || "user@example.com";
    const { method } = parsed.data;

    const session = await twoFAService.createSetupSession(
      userId,
      method,
      userEmail,
    );

    logger.info("2FA setup started", { userId, method });

    return res.json({
      sessionId: session.id,
      method: session.method,
      qrCode: session.qrCode,
      backupCodes: session.backupCodes,
      expiresAt: session.expiresAt,
    });
  }),
);

/**
 * POST /api/2fa/confirm-setup
 * Confirm 2FA setup with verification code
 */
router.post(
  "/confirm-setup",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = confirmSetupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const { sessionId, code } = parsed.data;

    const settings = await twoFAService.confirmSetup(userId, sessionId, code);

    logger.info("2FA setup confirmed", { userId, method: settings.method });

    return res.json({
      message: "2FA enabled successfully",
      method: settings.method,
    });
  }),
);

/**
 * POST /api/2fa/verify
 * Verify 2FA code
 */
router.post(
  "/verify",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = (req as any).user?.id || (req as any).userId;
    const { code, deviceId, rememberDevice, recoveryCode } = parsed.data;

    if (!userId) {
      return res.status(401).json({ error: "User ID required" });
    }

    const isValid = await twoFAService.verify({
      userId,
      code,
      method: "totp",
      deviceId,
      rememberDevice,
      recoveryCode,
    });

    if (!isValid) {
      return res.status(401).json({ error: "Invalid code" });
    }

    return res.json({
      message: "2FA verified successfully",
      verified: true,
    });
  }),
);

/**
 * GET /api/2fa/status
 * Get user 2FA status
 */
router.get(
  "/status",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const stats = await twoFAService.getStats(userId);

    return res.json(stats);
  }),
);

/**
 * POST /api/2fa/disable
 * Disable 2FA
 */
router.post(
  "/disable",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;

    await twoFAService.disable(userId);

    logger.info("2FA disabled", { userId });

    return res.json({
      message: "2FA disabled successfully",
    });
  }),
);

/**
 * POST /api/2fa/regenerate-codes
 * Regenerate backup recovery codes
 */
router.post(
  "/regenerate-codes",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;

    const codes = await twoFAService.regenerateRecoveryCodes(userId);

    logger.info("Recovery codes regenerated", { userId });

    return res.json({
      message: "Recovery codes regenerated",
      codes,
      count: codes.length,
    });
  }),
);

/**
 * GET /api/2fa/recovery-codes-count
 * Get remaining recovery codes count
 */
router.get(
  "/recovery-codes-count",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const count = await twoFAService.getRecoveryCodesCount(userId);

    return res.json({
      remainingCodes: count,
    });
  }),
);

/**
 * GET /api/2fa/audit-log
 * Get 2FA audit log
 */
router.get(
  "/audit-log",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const { limit } = req.query;

    const logs = await twoFAService.getAuditLogs(
      userId,
      limit ? parseInt(limit as string) : 100,
    );

    return res.json({
      userId,
      logs,
      total: logs.length,
    });
  }),
);

/**
 * POST /api/2fa/trust-device
 * Trust current device for 30 days
 */
router.post(
  "/trust-device",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const { deviceId } = req.body;

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId required" });
    }

    logger.info("Device trusted", { userId, deviceId });

    return res.json({
      message: "Device trusted for 30 days",
    });
  }),
);

/**
 * GET /api/2fa/is-enabled
 * Check if 2FA is enabled for user
 */
router.get(
  "/is-enabled",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.id || (req as any).userId;
    const stats = await twoFAService.getStats(userId);

    return res.json({
      enabled: stats.enabled,
      method: stats.method,
    });
  }),
);

export default router;
