"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCcw } from "lucide-react";

interface Change {
  id: string;
  userId: string;
  operation: string;
  fieldPath: string;
  oldValue?: any;
  newValue?: any;
  timestamp: Date;
  version: number;
}

interface ChangeHistoryProps {
  itineraryId: string;
  isOwner: boolean;
  onRestore?: (version: number) => Promise<void>;
}

export function ChangeHistory({
  itineraryId,
  isOwner,
  onRestore,
}: ChangeHistoryProps) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    fetchChanges();
  }, [itineraryId]);

  const fetchChanges = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/itineraries/${itineraryId}/changes?limit=50`,
      );
      if (!res.ok) throw new Error("Failed to fetch changes");

      const data = await res.json();
      setChanges(data.changes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load changes");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (version: number) => {
    try {
      setRestoring(version);
      const res = await fetch(`/api/itineraries/${itineraryId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNumber: version }),
      });

      if (!res.ok) throw new Error("Failed to restore version");

      await onRestore?.(version);
      await fetchChanges();
    } catch (err) {
      console.error(err);
    } finally {
      setRestoring(null);
    }
  };

  const getOperationLabel = (operation: string) => {
    const labels: Record<string, string> = {
      add: "Added",
      update: "Updated",
      delete: "Deleted",
      insert: "Inserted",
      replace: "Changed",
    };
    return labels[operation] || operation;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Change History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading changes...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change History</CardTitle>
        <CardDescription>
          Track all modifications to this itinerary
        </CardDescription>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {changes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No changes recorded yet
          </p>
        ) : (
          <div className="space-y-3">
            {changes.map((change) => (
              <div
                key={change.id}
                className="flex gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback>
                    {change.userId[0]?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {getOperationLabel(change.operation)} {change.fieldPath}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(change.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">
                      v{change.version}
                    </Badge>
                  </div>

                  {change.oldValue !== undefined &&
                    change.newValue !== undefined && (
                      <div className="mt-2 p-2 bg-muted rounded text-xs space-y-1">
                        <p>
                          <span className="text-muted-foreground">
                            Before:{" "}
                          </span>
                          <span className="font-mono line-through">
                            {String(change.oldValue).slice(0, 50)}
                          </span>
                        </p>
                        <p>
                          <span className="text-muted-foreground">After: </span>
                          <span className="font-mono text-green-600">
                            {String(change.newValue).slice(0, 50)}
                          </span>
                        </p>
                      </div>
                    )}

                  {isOwner && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(change.version)}
                      disabled={restoring === change.version}
                      className="mt-2 gap-2 text-xs"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore to this version
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
