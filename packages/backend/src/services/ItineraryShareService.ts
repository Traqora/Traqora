/**
 * Itinerary Sharing & Collaboration Service
 * Handles permissions, sharing, collaborative editing, and operational transforms
 */

import crypto from "crypto";
import { AppDataSource } from "../db/dataSource";
import { Booking } from "../db/entities/Booking";
import { logger } from "../utils/logger";
import { BadRequestError, NotFoundError } from "../utils/errors";
import { emailService } from "./EmailService";
import type {
  SharedItinerary,
  ItineraryCollaborator,
  ItineraryChange,
  ItineraryVersion,
  ShareInvitation,
  CollaborativeEdit,
  OperationTransform,
  AccessLog,
  PermissionLevel,
} from "../types/itinerary";

export class ItineraryShareService {
  private shareCache: Map<string, SharedItinerary> = new Map();
  private changeLog: Map<string, ItineraryChange[]> = new Map();
  private versions: Map<string, ItineraryVersion[]> = new Map();
  private accessLogs: Map<string, AccessLog[]> = new Map();

  /**
   * Generate secure share token
   */
  private generateShareToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Create share invitation
   */
  async createShareInvitation(
    itineraryId: string,
    ownerId: string,
    recipientEmail: string,
    permissionLevel: PermissionLevel = "edit",
    message?: string,
  ): Promise<ShareInvitation> {
    // Validate itinerary exists
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: itineraryId },
    });

    if (!booking) {
      throw new NotFoundError("Itinerary not found");
    }

    // Check owner
    if ((booking as any).userId !== ownerId && booking.id !== ownerId) {
      throw new BadRequestError("Only itinerary owner can share");
    }

    const invitationToken = this.generateShareToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation: ShareInvitation = {
      id: crypto.randomUUID(),
      itineraryId,
      senderEmail: (booking as any).ownerEmail || "unknown",
      recipientEmail,
      permissionLevel,
      message,
      invitationToken,
      expiresAt,
      status: "pending",
      createdAt: new Date(),
    };

    // Send email invitation
    const invitationLink = `${process.env.CLIENT_URL}/itinerary/${itineraryId}/accept?token=${invitationToken}`;
    await emailService.sendShareInvitation(
      recipientEmail,
      (booking as any).ownerName || "A traveler",
      (booking as any).title || "Travel Itinerary",
      invitationLink,
      permissionLevel,
      message,
    );

    logger.info("Share invitation created", {
      itineraryId,
      recipientEmail,
      permissionLevel,
    });

    return invitation;
  }

  /**
   * Accept share invitation
   */
  async acceptShareInvitation(
    itineraryId: string,
    invitationToken: string,
    collaboratorEmail: string,
  ): Promise<SharedItinerary> {
    // Verify token is valid
    const cache = this.shareCache.get(`${itineraryId}:${collaboratorEmail}`);
    if (!cache || cache.shareToken !== invitationToken) {
      throw new BadRequestError("Invalid or expired invitation token");
    }

    // Create shared itinerary record
    const shared: SharedItinerary = {
      id: crypto.randomUUID(),
      itineraryId,
      ownerId: cache.ownerId,
      sharedWith: collaboratorEmail,
      permissionLevel: cache.permissionLevel,
      status: "accepted",
      shareToken: invitationToken,
      createdAt: cache.createdAt,
      acceptedAt: new Date(),
    };

    this.shareCache.set(`${itineraryId}:${collaboratorEmail}`, shared);

    // Log access
    await this.logAccess(itineraryId, "unknown", collaboratorEmail, "edit");

    logger.info("Share invitation accepted", {
      itineraryId,
      collaboratorEmail,
    });

    return shared;
  }

  /**
   * Check permission level
   */
  async checkPermission(
    itineraryId: string,
    userId: string,
    userEmail: string,
    requiredLevel: PermissionLevel,
  ): Promise<boolean> {
    // Owner always has admin access
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: itineraryId },
    });

    if (!booking) return false;

    const isOwner = (booking as any).userId === userId || booking.id === userId;
    if (isOwner) return true;

    // Check shared access
    const shared = this.shareCache.get(`${itineraryId}:${userEmail}`);
    if (!shared || shared.status !== "accepted") {
      return false;
    }

    // Check permission level
    const levels: Record<PermissionLevel, number> = {
      view: 1,
      edit: 2,
      admin: 3,
    };

    return levels[shared.permissionLevel] >= levels[requiredLevel];
  }

  /**
   * Get collaborators for itinerary
   */
  async getCollaborators(
    itineraryId: string,
  ): Promise<ItineraryCollaborator[]> {
    const collaborators: ItineraryCollaborator[] = [];

    // Get all shares for this itinerary
    for (const [key, shared] of this.shareCache) {
      if (key.startsWith(`${itineraryId}:`)) {
        collaborators.push({
          id: shared.id,
          email: shared.sharedWith,
          permissionLevel: shared.permissionLevel,
          status: shared.status,
          joinedAt: shared.acceptedAt,
          lastActive: new Date(),
        });
      }
    }

    return collaborators;
  }

  /**
   * Revoke access
   */
  async revokeAccess(
    itineraryId: string,
    ownerId: string,
    collaboratorEmail: string,
  ): Promise<void> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: itineraryId },
    });

    if (!booking) throw new NotFoundError("Itinerary not found");

    const isOwner =
      (booking as any).userId === ownerId || booking.id === ownerId;
    if (!isOwner) {
      throw new BadRequestError("Only owner can revoke access");
    }

    const key = `${itineraryId}:${collaboratorEmail}`;
    const shared = this.shareCache.get(key);

    if (shared) {
      shared.status = "revoked";
      shared.revokedAt = new Date();
      this.shareCache.set(key, shared);
    }

    // Send notification
    await emailService.sendAccessRevoked(
      collaboratorEmail,
      (booking as any).title || "Travel Itinerary",
      (booking as any).ownerName || "The owner",
    );

    logger.info("Access revoked", { itineraryId, collaboratorEmail });
  }

  /**
   * Record collaborative edit with operational transform
   */
  async recordEdit(
    itineraryId: string,
    userId: string,
    edit: CollaborativeEdit,
  ): Promise<ItineraryChange> {
    // Get current version
    const versions = this.versions.get(itineraryId) || [];
    const currentVersion =
      versions.length > 0 ? versions[versions.length - 1].version : 0;

    // Parse operation
    const [fieldPath, operation] = this.parseOperation(edit.operation);

    const change: ItineraryChange = {
      id: crypto.randomUUID(),
      itineraryId,
      userId,
      operation: operation.type as any,
      fieldPath,
      oldValue: operation.oldValue,
      newValue: operation.newValue,
      timestamp: new Date(),
      version: currentVersion + 1,
    };

    // Store change
    const changes = this.changeLog.get(itineraryId) || [];
    changes.push(change);
    this.changeLog.set(itineraryId, changes);

    logger.info("Edit recorded", { itineraryId, userId, fieldPath });

    return change;
  }

  /**
   * Transform operations for conflict resolution
   */
  resolveConflict(
    op1: CollaborativeEdit,
    op2: CollaborativeEdit,
  ): OperationTransform {
    // Simple conflict resolution: last-write-wins
    const priority = op2.timestamp.getTime() - op1.timestamp.getTime();

    return {
      operation: priority > 0 ? op2.operation : op1.operation,
      transformedOperation: op2.operation,
      conflictResolved: true,
      priority,
    };
  }

  /**
   * Get change history
   */
  async getChangeHistory(
    itineraryId: string,
    limit: number = 50,
  ): Promise<ItineraryChange[]> {
    const changes = this.changeLog.get(itineraryId) || [];
    return changes.slice(-limit);
  }

  /**
   * Create version snapshot
   */
  async createVersionSnapshot(
    itineraryId: string,
    userId: string,
    snapshot: Record<string, any>,
  ): Promise<ItineraryVersion> {
    const versions = this.versions.get(itineraryId) || [];
    const nextVersion =
      versions.length > 0 ? versions[versions.length - 1].version + 1 : 1;
    const changes = this.changeLog.get(itineraryId) || [];

    const version: ItineraryVersion = {
      version: nextVersion,
      createdBy: userId,
      createdAt: new Date(),
      snapshot,
      changes: changes.filter((c) => c.version === nextVersion),
    };

    versions.push(version);
    this.versions.set(itineraryId, versions);

    logger.info("Version snapshot created", {
      itineraryId,
      version: nextVersion,
    });

    return version;
  }

  /**
   * Get version history
   */
  async getVersionHistory(itineraryId: string): Promise<ItineraryVersion[]> {
    return this.versions.get(itineraryId) || [];
  }

  /**
   * Restore previous version
   */
  async restoreVersion(
    itineraryId: string,
    versionNumber: number,
    userId: string,
  ): Promise<Record<string, any>> {
    const versions = this.versions.get(itineraryId) || [];
    const targetVersion = versions.find((v) => v.version === versionNumber);

    if (!targetVersion) {
      throw new NotFoundError(`Version ${versionNumber} not found`);
    }

    logger.info("Version restored", {
      itineraryId,
      version: versionNumber,
      restoredBy: userId,
    });

    return targetVersion.snapshot;
  }

  /**
   * Log access for audit trail
   */
  async logAccess(
    itineraryId: string,
    userId: string,
    email: string,
    action: "view" | "edit" | "share" | "revoke" | "download",
  ): Promise<void> {
    const log: AccessLog = {
      id: crypto.randomUUID(),
      itineraryId,
      userId,
      email,
      action,
      timestamp: new Date(),
    };

    const logs = this.accessLogs.get(itineraryId) || [];
    logs.push(log);
    this.accessLogs.set(itineraryId, logs);
  }

  /**
   * Get access audit log
   */
  async getAccessLog(
    itineraryId: string,
    limit: number = 100,
  ): Promise<AccessLog[]> {
    const logs = this.accessLogs.get(itineraryId) || [];
    return logs.slice(-limit);
  }

  /**
   * Helper: Parse operation
   */
  private parseOperation(
    op: CollaborativeEdit["operation"],
  ): [string, { type: string; oldValue?: any; newValue?: any }] {
    return [
      op.path,
      {
        type: op.type,
        oldValue: undefined,
        newValue: op.value,
      },
    ];
  }
}

export const itineraryShareService = new ItineraryShareService();
