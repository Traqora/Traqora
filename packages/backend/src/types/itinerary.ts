/**
 * Itinerary Sharing & Collaboration Types
 */

export type PermissionLevel = "view" | "edit" | "admin";
export type ShareStatus = "pending" | "accepted" | "rejected" | "revoked";

export interface SharedItinerary {
  id: string;
  itineraryId: string;
  ownerId: string;
  sharedWith: string; // email
  permissionLevel: PermissionLevel;
  status: ShareStatus;
  shareToken: string;
  createdAt: Date;
  expiresAt?: Date;
  acceptedAt?: Date;
  revokedAt?: Date;
}

export interface ItineraryCollaborator {
  id: string;
  email: string;
  permissionLevel: PermissionLevel;
  status: ShareStatus;
  joinedAt?: Date;
  lastActive?: Date;
}

export interface ItineraryChange {
  id: string;
  itineraryId: string;
  userId: string;
  operation: "add" | "update" | "delete";
  fieldPath: string; // e.g., "flights[0].departure"
  oldValue?: any;
  newValue?: any;
  timestamp: Date;
  version: number;
}

export interface ItineraryVersion {
  version: number;
  createdBy: string;
  createdAt: Date;
  snapshot: Record<string, any>;
  changes: ItineraryChange[];
}

export interface SharedItineraryAccess {
  itineraryId: string;
  collaborators: ItineraryCollaborator[];
  versions: ItineraryVersion[];
  currentVersion: number;
  lastModified: Date;
  lastModifiedBy: string;
}

export interface ShareInvitation {
  id: string;
  itineraryId: string;
  senderEmail: string;
  recipientEmail: string;
  permissionLevel: PermissionLevel;
  message?: string;
  invitationToken: string;
  expiresAt: Date;
  status: "pending" | "accepted" | "declined" | "expired";
  createdAt: Date;
  respondedAt?: Date;
}

export interface CollaborativeEdit {
  userId: string;
  itineraryId: string;
  operation: {
    type: "insert" | "delete" | "replace";
    path: string;
    value?: any;
  };
  timestamp: Date;
  version: number;
  clientId: string; // For conflict resolution
}

export interface OperationTransform {
  operation: CollaborativeEdit["operation"];
  transformedOperation?: CollaborativeEdit["operation"];
  conflictResolved: boolean;
  priority: number;
}

export interface ItineraryDiff {
  field: string;
  before: any;
  after: any;
  changedBy: string;
  changedAt: Date;
}

export interface AccessLog {
  id: string;
  itineraryId: string;
  userId: string;
  email: string;
  action: "view" | "edit" | "share" | "revoke" | "download";
  details?: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
}
