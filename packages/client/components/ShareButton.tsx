"use client"

import { useState } from "react"
import { Share2, Copy, Check, Trash2, Link, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"

interface Share {
  id: string
  shareToken: string
  permission: "view" | "comment" | "edit"
  isActive: boolean
  expiresAt: string | null
  createdAt: string
}

interface ShareButtonProps {
  dashboardId: string
  className?: string
}

export function ShareButton({ dashboardId, className }: ShareButtonProps) {
  const [open, setOpen] = useState(false)
  const [shares, setShares] = useState<Share[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [permission, setPermission] = useState<"view" | "comment" | "edit">("view")
  const [expiresInDays, setExpiresInDays] = useState<string>("")
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const fetchShares = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem("authToken")
      const res = await fetch(`/api/v1/collaboration/shares?dashboardId=${encodeURIComponent(dashboardId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (res.ok) {
        const json = await res.json()
        setShares(json.data ?? [])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen) fetchShares()
  }

  const createShare = async () => {
    setCreating(true)
    try {
      const token = localStorage.getItem("authToken")
      const body: Record<string, unknown> = { dashboardId, permission }
      if (expiresInDays) body.expiresInDays = parseInt(expiresInDays, 10)

      const res = await fetch("/api/v1/collaboration/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        await fetchShares()
        setExpiresInDays("")
      }
    } catch {
      // ignore
    } finally {
      setCreating(false)
    }
  }

  const revokeShare = async (id: string) => {
    const token = localStorage.getItem("authToken")
    await fetch(`/api/v1/collaboration/shares/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    setShares((prev) => prev.filter((s) => s.id !== id))
  }

  const copyLink = (shareToken: string) => {
    const url = `${window.location.origin}/analytics?share=${shareToken}`
    navigator.clipboard.writeText(url).then(() => {
      setCopiedToken(shareToken)
      setTimeout(() => setCopiedToken(null), 2000)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Share Dashboard
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Create new share */}
          <div className="space-y-3 border rounded-lg p-4">
            <h4 className="text-sm font-medium">Create share link</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Permission</Label>
                <Select value={permission} onValueChange={(v) => setPermission(v as typeof permission)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View only</SelectItem>
                    <SelectItem value="comment">Can comment</SelectItem>
                    <SelectItem value="edit">Can edit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expires in (days)</Label>
                <Input
                  type="number"
                  placeholder="Never"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  className="h-8 text-sm"
                  min={1}
                />
              </div>
            </div>
            <Button onClick={createShare} disabled={creating} size="sm" className="w-full">
              <Link className="h-4 w-4 mr-2" />
              {creating ? "Creating…" : "Generate link"}
            </Button>
          </div>

          {/* Existing shares */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">
              Active links {loading && <span className="animate-pulse">…</span>}
            </h4>
            {shares.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground text-center py-4">No share links yet</p>
            )}
            {shares.map((share) => (
              <div
                key={share.id}
                className="flex items-center justify-between gap-2 p-2 border rounded-md text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {share.permission}
                  </Badge>
                  <span className="text-muted-foreground text-xs truncate">
                    {share.expiresAt
                      ? `Expires ${new Date(share.expiresAt).toLocaleDateString()}`
                      : "Never expires"}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyLink(share.shareToken)}
                  >
                    {copiedToken === share.shareToken ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => revokeShare(share.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
