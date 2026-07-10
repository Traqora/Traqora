"use client"

import { useEffect, useMemo, useState } from "react"
import { Download, Eye, Filter, RefreshCw, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type AuditAction = "all" | "analytics_access" | "analytics_query" | "analytics_export" | "dashboard_view"

interface AuditLogRow {
  id: string
  action: Exclude<AuditAction, "all">
  route: string
  method: string
  actorId: string | null
  actorEmail: string | null
  actorType: string
  tenantId: string | null
  queryParams: string | null
  metadata: string | null
  statusCode: number | null
  durationMs: number | null
  ipAddress: string
  userAgent: string | null
  createdAt: string
}

interface AuditResponse {
  data: AuditLogRow[]
  pagination: {
    total: number
    limit: number
    offset: number
  }
  retentionDays: number
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

function adminHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {}
  const apiKey = localStorage.getItem("adminApiKey")
  const token = localStorage.getItem("authToken")
  if (apiKey) return { "X-Admin-Api-Key": apiKey }
  if (token) return { Authorization: `Bearer ${token}` }
  return {}
}

function actionVariant(action: AuditLogRow["action"]) {
  if (action === "analytics_export") return "destructive"
  if (action === "dashboard_view") return "secondary"
  return "default"
}

export default function AuditLogViewerPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [action, setAction] = useState<AuditAction>("all")
  const [actorId, setActorId] = useState("")
  const [route, setRoute] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [retentionDays, setRetentionDays] = useState(365)

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: "100" })
    if (action !== "all") params.set("action", action)
    if (actorId.trim()) params.set("actorId", actorId.trim())
    if (route.trim()) params.set("route", route.trim())
    return params
  }, [action, actorId, route])

  const loadLogs = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/analytics/audit?${query.toString()}`, {
        headers: adminHeaders(),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = (await response.json()) as AuditResponse
      setRows(data.data)
      setTotal(data.pagination.total)
      setRetentionDays(data.retentionDays)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs")
    } finally {
      setLoading(false)
    }
  }

  const exportLogs = () => {
    window.open(`${API_BASE_URL}/api/v1/admin/analytics/audit/export?${query.toString()}`, "_blank", "noopener,noreferrer")
  }

  useEffect(() => {
    loadLogs()
    void fetch(`${API_BASE_URL}/api/v1/admin/analytics/audit/dashboard-view`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...adminHeaders() },
      body: JSON.stringify({ dashboardId: "analytics/audit" }),
    }).catch(() => undefined)
  }, [query])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-primary" />
              <h1 className="font-serif text-3xl font-bold text-foreground">Analytics Audit Logs</h1>
            </div>
            <p className="text-muted-foreground">
              Review analytics access, query parameters, dashboard views, and export activity.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadLogs} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button onClick={exportLogs}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total matching events</p>
              <p className="text-2xl font-bold">{total.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Retention policy</p>
              <p className="text-2xl font-bold">{retentionDays} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Visible rows</p>
              <p className="text-2xl font-bold">{rows.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Search audit events by action, actor, or exact route.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="action">Action</Label>
              <Select value={action} onValueChange={(value) => setAction(value as AuditAction)}>
                <SelectTrigger id="action">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All actions</SelectItem>
                  <SelectItem value="analytics_access">Access</SelectItem>
                  <SelectItem value="analytics_query">Query</SelectItem>
                  <SelectItem value="analytics_export">Export</SelectItem>
                  <SelectItem value="dashboard_view">Dashboard view</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="actor">Actor ID</Label>
              <Input id="actor" value={actorId} onChange={(event) => setActorId(event.target.value)} placeholder="admin id or wallet" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="route">Route</Label>
              <Input id="route" value={route} onChange={(event) => setRoute(event.target.value)} placeholder="/api/v1/admin/analytics" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif">
              <Eye className="h-5 w-5" />
              Audit Trail
            </CardTitle>
            {error && <CardDescription className="text-destructive">{error}</CardDescription>}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Query Params</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-sm">{new Date(row.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={actionVariant(row.action)}>{row.action}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{row.actorId || "anonymous"}</div>
                      <div className="text-xs text-muted-foreground">{row.actorType}</div>
                    </TableCell>
                    <TableCell className="min-w-64 text-sm">
                      <div className="font-medium">{row.method} {row.route}</div>
                      <div className="text-xs text-muted-foreground">{row.durationMs ?? 0}ms</div>
                    </TableCell>
                    <TableCell>{row.statusCode ?? "-"}</TableCell>
                    <TableCell className="max-w-80 truncate font-mono text-xs">{row.queryParams || "{}"}</TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No audit events match the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
