"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Trash2, Check, Clock, AlertCircle } from "lucide-react";
import type { ItineraryCollaborator } from "@/types/itinerary";

interface CollaboratorsListProps {
  itineraryId: string;
  isOwner: boolean;
  onCollaboratorRemoved?: (email: string) => void;
}

export function CollaboratorsList({
  itineraryId,
  isOwner,
  onCollaboratorRemoved,
}: CollaboratorsListProps) {
  const [collaborators, setCollaborators] = useState<ItineraryCollaborator[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);

  useEffect(() => {
    fetchCollaborators();
  }, [itineraryId]);

  const fetchCollaborators = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/itineraries/${itineraryId}/collaborators`);
      if (!res.ok) throw new Error("Failed to fetch collaborators");

      const data = await res.json();
      setCollaborators(data.collaborators);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load collaborators",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (email: string) => {
    if (!isOwner) return;

    try {
      setRevoking(email);
      const res = await fetch("/api/itineraries/revoke-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itineraryId, collaboratorEmail: email }),
      });

      if (!res.ok) throw new Error("Failed to revoke access");

      setCollaborators(collaborators.filter((c) => c.email !== email));
      onCollaboratorRemoved?.(email);
    } catch (err) {
      console.error(err);
    } finally {
      setRevoking(null);
      setRevokeTarget(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "accepted":
        return <Check className="h-4 w-4 text-green-600" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "accepted":
        return "Active";
      case "pending":
        return "Pending";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted":
        return "bg-green-50 text-green-900";
      case "pending":
        return "bg-yellow-50 text-yellow-900";
      default:
        return "bg-gray-50 text-gray-900";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Collaborators</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Loading collaborators...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Collaborators ({collaborators.length})</CardTitle>
          <CardDescription>
            People who have access to this itinerary
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {collaborators.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No collaborators yet. Share this itinerary to invite people.
            </p>
          ) : (
            <div className="space-y-3">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>
                        {collaborator.email[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {collaborator.email}
                      </p>
                      <div className="flex gap-2 items-center mt-1">
                        <div className="flex items-center gap-1">
                          {getStatusIcon(collaborator.status)}
                          <span className="text-xs text-muted-foreground">
                            {getStatusLabel(collaborator.status)}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {collaborator.permissionLevel === "view"
                            ? "View Only"
                            : "Can Edit"}
                        </Badge>
                        {collaborator.lastActive && (
                          <span className="text-xs text-muted-foreground">
                            Active{" "}
                            {new Date(
                              collaborator.lastActive,
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {isOwner && collaborator.status === "accepted" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeTarget(collaborator.email)}
                      disabled={revoking === collaborator.email}
                      className="ml-2"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Access</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke access for {revokeTarget}? They
              will no longer be able to view or edit this itinerary.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && handleRevoke(revokeTarget)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Revoke Access
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
