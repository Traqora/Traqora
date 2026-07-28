/**
 * Client-side itinerary types
 */

export type PermissionLevel = "view" | "edit" | "admin";
export type ShareStatus = "pending" | "accepted" | "rejected" | "revoked";

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
  fieldPath: string;
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
