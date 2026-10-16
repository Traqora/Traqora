/**
 * Client-side API functions for itinerary sharing and collaboration
 */

import type {
  PermissionLevel,
  ItineraryCollaborator,
  ItineraryChange,
  ItineraryVersion,
} from "@/types/itinerary";

/**
 * Share itinerary via email
 */
export async function shareItinerary(
  itineraryId: string,
  recipientEmail: string,
  permissionLevel: PermissionLevel = "edit",
  message?: string,
): Promise<{
  invitationId: string;
  recipientEmail: string;
  permissionLevel: PermissionLevel;
  expiresAt: Date;
  status: string;
}> {
  const res = await fetch("/api/itineraries/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itineraryId,
      recipientEmail,
      permissionLevel,
      message,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to share itinerary");
  }

  return res.json();
}

/**
 * Accept share invitation
 */
export async function acceptShareInvitation(
  itineraryId: string,
  invitationToken: string,
): Promise<{
  message: string;
  itineraryId: string;
  permissionLevel: PermissionLevel;
}> {
  const res = await fetch("/api/itineraries/accept-share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itineraryId,
      invitationToken,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to accept invitation");
  }

  return res.json();
}

/**
 * Get collaborators for an itinerary
 */
export async function getCollaborators(itineraryId: string): Promise<{
  itineraryId: string;
  collaborators: ItineraryCollaborator[];
  totalCollaborators: number;
}> {
  const res = await fetch(`/api/itineraries/${itineraryId}/collaborators`);

  if (!res.ok) {
    throw new Error("Failed to fetch collaborators");
  }

  return res.json();
}

/**
 * Revoke collaborator access
 */
export async function revokeAccess(
  itineraryId: string,
  collaboratorEmail: string,
): Promise<{
  message: string;
  itineraryId: string;
  collaboratorEmail: string;
}> {
  const res = await fetch("/api/itineraries/revoke-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itineraryId,
      collaboratorEmail,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to revoke access");
  }

  return res.json();
}

/**
 * Record a collaborative edit
 */
export async function recordEdit(
  itineraryId: string,
  operation: {
    type: "insert" | "delete" | "replace";
    path: string;
    value?: any;
  },
): Promise<{
  changeId: string;
  version: number;
  timestamp: Date;
}> {
  const res = await fetch("/api/itineraries/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      itineraryId,
      operation,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to record edit");
  }

  return res.json();
}

/**
 * Get change history
 */
export async function getChangeHistory(
  itineraryId: string,
  limit: number = 50,
): Promise<{
  itineraryId: string;
  changes: ItineraryChange[];
  totalChanges: number;
}> {
  const res = await fetch(
    `/api/itineraries/${itineraryId}/changes?limit=${limit}`,
  );

  if (!res.ok) {
    throw new Error("Failed to fetch change history");
  }

  return res.json();
}

/**
 * Get version history
 */
export async function getVersionHistory(itineraryId: string): Promise<{
  itineraryId: string;
  versions: ItineraryVersion[];
  totalVersions: number;
}> {
  const res = await fetch(`/api/itineraries/${itineraryId}/versions`);

  if (!res.ok) {
    throw new Error("Failed to fetch version history");
  }

  return res.json();
}

/**
 * Restore to a previous version
 */
export async function restoreVersion(
  itineraryId: string,
  versionNumber: number,
): Promise<{
  message: string;
  itineraryId: string;
  versionNumber: number;
  snapshot: Record<string, any>;
}> {
  const res = await fetch(`/api/itineraries/${itineraryId}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionNumber }),
  });

  if (!res.ok) {
    throw new Error("Failed to restore version");
  }

  return res.json();
}

/**
 * Get access audit log (owner only)
 */
export async function getAccessLog(itineraryId: string): Promise<{
  itineraryId: string;
  logs: Array<{
    id: string;
    userId: string;
    email: string;
    action: string;
    timestamp: Date;
  }>;
  totalLogs: number;
}> {
  const res = await fetch(`/api/itineraries/${itineraryId}/audit-log`);

  if (!res.ok) {
    throw new Error("Failed to fetch audit log");
  }

  return res.json();
}
