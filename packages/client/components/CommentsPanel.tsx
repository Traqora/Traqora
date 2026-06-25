"use client"

import { useState, useEffect, useRef } from "react"
import { MessageSquare, Send, CheckCircle, Trash2, ChevronDown, ChevronUp, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

interface Comment {
  id: string
  dashboardId: string
  target: string | null
  targetType: "dashboard" | "chart" | "datapoint"
  authorWallet: string
  authorName: string | null
  body: string
  parentId: string | null
  resolved: boolean
  createdAt: string
  updatedAt: string
}

interface ActivityItem {
  type: "comment" | "share"
  item: Comment | { id: string; shareToken: string; permission: string; createdBy: string; createdAt: string }
  at: string
}

interface CommentsPanelProps {
  dashboardId: string
  target?: string
  targetType?: "dashboard" | "chart" | "datapoint"
  className?: string
}

export function CommentsPanel({ dashboardId, target, targetType = "dashboard", className }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activeTab, setActiveTab] = useState<"comments" | "activity">("comments")
  const [body, setBody] = useState("")
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const authHeader = () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("authToken") : null
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const fetchComments = async () => {
    try {
      const params = new URLSearchParams({ dashboardId })
      if (target) params.set("target", target)
      const res = await fetch(`/api/v1/collaboration/comments?${params}`, { headers: authHeader() })
      if (res.ok) {
        const json = await res.json()
        setComments(json.data ?? [])
      }
    } catch {
      // ignore
    }
  }

  const fetchActivity = async () => {
    try {
      const res = await fetch(
        `/api/v1/collaboration/activity?dashboardId=${encodeURIComponent(dashboardId)}&limit=30`,
        { headers: authHeader() }
      )
      if (res.ok) {
        const json = await res.json()
        setActivity(json.data ?? [])
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([fetchComments(), fetchActivity()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardId, target])

  const submitComment = async () => {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/v1/collaboration/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ dashboardId, target, targetType, body: body.trim(), parentId: replyTo }),
      })
      if (res.ok) {
        setBody("")
        setReplyTo(null)
        await fetchComments()
        await fetchActivity()
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100)
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  const resolveComment = async (id: string) => {
    await fetch(`/api/v1/collaboration/comments/${id}/resolve`, {
      method: "PATCH",
      headers: authHeader(),
    })
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved: true } : c)))
  }

  const deleteComment = async (id: string) => {
    await fetch(`/api/v1/collaboration/comments/${id}`, {
      method: "DELETE",
      headers: authHeader(),
    })
    setComments((prev) => prev.filter((c) => c.id !== id))
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60_000) return "just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return d.toLocaleDateString()
  }

  const shortWallet = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

  return (
    <div className={`border rounded-lg bg-background flex flex-col ${className ?? ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Comments</span>
          {comments.length > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5">
              {comments.length}
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
      </div>

      {!collapsed && (
        <>
          {/* Tabs */}
          <div className="flex border-b">
            <button
              className={`flex-1 text-xs py-2 font-medium transition-colors ${activeTab === "comments" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
              onClick={() => setActiveTab("comments")}
            >
              Comments
            </button>
            <button
              className={`flex-1 text-xs py-2 font-medium transition-colors flex items-center justify-center gap-1 ${activeTab === "activity" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
              onClick={() => setActiveTab("activity")}
            >
              <Activity className="h-3 w-3" />
              Activity
            </button>
          </div>

          {/* Comments list */}
          {activeTab === "comments" && (
            <>
              <ScrollArea className="flex-1 max-h-80">
                <div className="p-3 space-y-3">
                  {loading && <p className="text-xs text-center text-muted-foreground py-4">Loading…</p>}
                  {!loading && comments.length === 0 && (
                    <p className="text-xs text-center text-muted-foreground py-8">
                      No comments yet. Start the conversation!
                    </p>
                  )}
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`text-sm rounded-md p-3 space-y-1 ${comment.parentId ? "ml-4 bg-muted/50" : "bg-muted/30"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {comment.authorName ?? shortWallet(comment.authorWallet)}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">{formatTime(comment.createdAt)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-60 hover:opacity-100"
                            onClick={() => resolveComment(comment.id)}
                            title="Mark resolved"
                          >
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-60 hover:opacity-100 text-destructive"
                            onClick={() => deleteComment(comment.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-foreground leading-snug">{comment.body}</p>
                      {comment.target && (
                        <Badge variant="outline" className="text-xs h-4 px-1">
                          {comment.target}
                        </Badge>
                      )}
                      <button
                        className="text-xs text-muted-foreground hover:text-primary"
                        onClick={() => setReplyTo(comment.id)}
                      >
                        Reply
                      </button>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <Separator />

              {/* Compose */}
              <div className="p-3 space-y-2">
                {replyTo && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Replying to thread</span>
                    <button onClick={() => setReplyTo(null)} className="hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                )}
                <Textarea
                  placeholder="Add a comment…"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="min-h-[64px] text-sm resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      submitComment()
                    }
                  }}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">⌘+Enter to submit</span>
                  <Button size="sm" onClick={submitComment} disabled={submitting || !body.trim()}>
                    <Send className="h-3 w-3 mr-1" />
                    {submitting ? "Posting…" : "Post"}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Activity feed */}
          {activeTab === "activity" && (
            <ScrollArea className="flex-1 max-h-80">
              <div className="p-3 space-y-2">
                {activity.length === 0 && (
                  <p className="text-xs text-center text-muted-foreground py-8">No recent activity</p>
                )}
                {activity.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="mt-0.5 shrink-0">
                      {item.type === "comment" ? (
                        <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <Activity className="h-3.5 w-3.5 text-green-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.type === "comment" ? (
                        <span>
                          <span className="font-medium text-foreground">
                            {((item.item as Comment).authorName) ??
                              shortWallet((item.item as Comment).authorWallet)}
                          </span>{" "}
                          commented on{" "}
                          <span className="font-medium text-foreground">
                            {(item.item as Comment).target ?? "this dashboard"}
                          </span>
                        </span>
                      ) : (
                        <span>
                          Dashboard shared with{" "}
                          <span className="font-medium text-foreground">
                            {(item.item as { permission: string }).permission}
                          </span>{" "}
                          access
                        </span>
                      )}
                      <span className="ml-1 text-muted-foreground">{formatTime(item.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </>
      )}
    </div>
  )
}
