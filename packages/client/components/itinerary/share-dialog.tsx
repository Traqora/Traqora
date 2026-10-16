"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Share2, Check, AlertCircle } from "lucide-react";
import type { PermissionLevel } from "@/types/itinerary";

interface ShareDialogProps {
  itineraryId: string;
  itineraryTitle: string;
  onShare?: (email: string, permission: PermissionLevel) => Promise<void>;
}

export function ShareDialog({
  itineraryId,
  itineraryTitle,
  onShare,
}: ShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<PermissionLevel>("edit");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleShare = async () => {
    if (!email) {
      setError("Please enter an email address");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/itineraries/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itineraryId,
          recipientEmail: email,
          permissionLevel: permission,
          message: message || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to share");
      }

      setSuccess(true);
      onShare?.(email, permission);

      // Reset form
      setTimeout(() => {
        setEmail("");
        setPermission("edit");
        setMessage("");
        setSuccess(false);
        setOpen(false);
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to share itinerary",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Share2 className="h-4 w-4" />
          Share
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Share Itinerary</DialogTitle>
          <DialogDescription>
            Invite collaborators to view and edit "{itineraryTitle}"
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <p className="text-center font-medium">
              Invitation sent successfully!
            </p>
            <p className="text-sm text-muted-foreground text-center">
              {email} will receive an invitation email with access instructions.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {error && (
              <div className="flex gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <Input
                type="email"
                placeholder="collaborator@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                The person will need to accept the invitation
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Permission Level</label>
              <Select
                value={permission}
                onValueChange={(val) => setPermission(val as PermissionLevel)}
              >
                <SelectTrigger disabled={loading}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">
                    <div className="flex flex-col gap-1">
                      <span>View Only</span>
                      <span className="text-xs text-muted-foreground">
                        Can view but not edit
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="edit">
                    <div className="flex flex-col gap-1">
                      <span>Can Edit</span>
                      <span className="text-xs text-muted-foreground">
                        Can view and make changes
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Message (Optional)</label>
              <Textarea
                placeholder="Add a personal message..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                {message.length}/500
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button onClick={handleShare} disabled={loading}>
                {loading ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
