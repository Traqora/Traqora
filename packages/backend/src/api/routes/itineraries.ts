/**
 * Itinerary Sharing & Collaboration Routes
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/authMiddleware";
import { asyncHandler } from "../../utils/errorHandler";
import { itineraryShareService } from "../../services/ItineraryShareService";
import { logger } from "../../utils/logger";

const router = Router();

// Schemas
const createShareSchema = z.object({
  itineraryId: z.string().uuid(),
  recipientEmail: z.string().email(),
  permissionLevel: z.enum(["view", "edit"]).default("edit"),
  message: z.string().max(500).optional(),
});

const acceptShareSchema = z.object({
  itineraryId: z.string().uuid(),
  invitationToken: z.string(),
});

const recordEditSchema = z.object({
  itineraryId: z.string().uuid(),
  operation: z.object({
    type: z.enum(["insert", "delete", "replace"]),
    path: z.string(),
    value: z.any().optional(),
  }),
});

const revokeAccessSchema = z.object({
  itineraryId: z.string().uuid(),
  collaboratorEmail: z.string().email(),
});

/**
 * POST /api/itineraries/share
 * Create and send share invitation
 */
router.post(
  "/share",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { itineraryId, recipientEmail, permissionLevel, message } =
      parsed.data;
    const userId = (req as any).user?.id || (req as any).userId;

    const invitation = await itineraryShareService.createShareInvitation(
      itineraryId,
      userId,
      recipientEmail,
      permissionLevel,
      message,
    );

    logger.info("Share invitation created via API", {
      itineraryId,
      recipientEmail,
      permissionLevel,
    });

    return res.json({
      invitationId: invitation.id,
      recipientEmail: invitation.recipientEmail,
      permissionLevel: invitation.permissionLevel,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    });
  }),
);

/**
 * POST /api/itineraries/accept-share
 * Accept share invitation
 */
router.post(
  "/accept-share",
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = acceptShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { itineraryId, invitationToken } = parsed.data;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    if (!userEmail) {
      return res.status(401).json({ error: "User email required" });
    }

    const shared = await itineraryShareService.acceptShareInvitation(
      itineraryId,
      invitationToken,
      userEmail,
    );

    logger.info("Share invitation accepted", { itineraryId, email: userEmail });

    return res.json({
      message: "Invitation accepted successfully",
      itineraryId: shared.itineraryId,
      permissionLevel: shared.permissionLevel,
    });
  }),
);

/**
 * GET /api/itineraries/:itineraryId/collaborators
 * Get list of collaborators
 */
router.get(
  "/:itineraryId/collaborators",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { itineraryId } = req.params;
    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    // Check permission
    const hasAccess = await itineraryShareService.checkPermission(
      itineraryId,
      userId,
      userEmail,
      "view",
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const collaborators =
      await itineraryShareService.getCollaborators(itineraryId);

    return res.json({
      itineraryId,
      collaborators,
      totalCollaborators: collaborators.length,
    });
  }),
);

/**
 * POST /api/itineraries/revoke-access
 * Revoke collaborator access
 */
router.post(
  "/revoke-access",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = revokeAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { itineraryId, collaboratorEmail } = parsed.data;
    const userId = (req as any).user?.id || (req as any).userId;

    await itineraryShareService.revokeAccess(
      itineraryId,
      userId,
      collaboratorEmail,
    );

    logger.info("Access revoked", { itineraryId, collaboratorEmail });

    return res.json({
      message: "Access revoked successfully",
      itineraryId,
      collaboratorEmail,
    });
  }),
);

/**
 * POST /api/itineraries/edit
 * Record collaborative edit
 */
router.post(
  "/edit",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = recordEditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { itineraryId, operation } = parsed.data;
    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    // Check permission
    const hasAccess = await itineraryShareService.checkPermission(
      itineraryId,
      userId,
      userEmail,
      "edit",
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Edit permission required" });
    }

    const change = await itineraryShareService.recordEdit(itineraryId, userId, {
      userId,
      itineraryId,
      operation,
      timestamp: new Date(),
      version: 1,
      clientId: (req as any).clientId || "unknown",
    });

    logger.info("Edit recorded", { itineraryId, userId, path: operation.path });

    return res.json({
      changeId: change.id,
      version: change.version,
      timestamp: change.timestamp,
    });
  }),
);

/**
 * GET /api/itineraries/:itineraryId/changes
 * Get change history
 */
router.get(
  "/:itineraryId/changes",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { itineraryId } = req.params;
    const { limit } = req.query;
    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    // Check permission
    const hasAccess = await itineraryShareService.checkPermission(
      itineraryId,
      userId,
      userEmail,
      "view",
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const changes = await itineraryShareService.getChangeHistory(
      itineraryId,
      limit ? parseInt(limit as string) : 50,
    );

    return res.json({
      itineraryId,
      changes,
      totalChanges: changes.length,
    });
  }),
);

/**
 * GET /api/itineraries/:itineraryId/versions
 * Get version history
 */
router.get(
  "/:itineraryId/versions",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { itineraryId } = req.params;
    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    // Check permission
    const hasAccess = await itineraryShareService.checkPermission(
      itineraryId,
      userId,
      userEmail,
      "view",
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const versions = await itineraryShareService.getVersionHistory(itineraryId);

    return res.json({
      itineraryId,
      versions,
      totalVersions: versions.length,
    });
  }),
);

/**
 * POST /api/itineraries/:itineraryId/restore
 * Restore previous version
 */
router.post(
  "/:itineraryId/restore",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { itineraryId } = req.params;
    const { versionNumber } = req.body;
    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    // Check permission
    const hasAccess = await itineraryShareService.checkPermission(
      itineraryId,
      userId,
      userEmail,
      "edit",
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Edit permission required" });
    }

    if (!versionNumber) {
      return res.status(400).json({ error: "versionNumber required" });
    }

    const snapshot = await itineraryShareService.restoreVersion(
      itineraryId,
      versionNumber,
      userId,
    );

    logger.info("Version restored", { itineraryId, versionNumber, userId });

    return res.json({
      message: "Version restored successfully",
      itineraryId,
      versionNumber,
      snapshot,
    });
  }),
);

/**
 * GET /api/itineraries/:itineraryId/audit-log
 * Get access audit log
 */
router.get(
  "/:itineraryId/audit-log",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { itineraryId } = req.params;
    const userId = (req as any).user?.id || (req as any).userId;
    const userEmail = (req as any).user?.email || (req as any).userEmail;

    // Check permission (admin only)
    const hasAccess = await itineraryShareService.checkPermission(
      itineraryId,
      userId,
      userEmail,
      "admin",
    );

    if (!hasAccess) {
      return res.status(403).json({ error: "Admin permission required" });
    }

    const logs = await itineraryShareService.getAccessLog(itineraryId);

    return res.json({
      itineraryId,
      logs,
      totalLogs: logs.length,
    });
  }),
);

export default router;
