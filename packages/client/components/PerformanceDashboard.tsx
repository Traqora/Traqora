"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  Gauge,
  RefreshCw,
  Server,
  TrendingUp,
} from "lucide-react"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getPerformanceSnapshot, PerformanceSnapshot } from "@/lib/api"

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatDuration(ms: number) {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${ms}ms`
}

function statusVariant(status: PerformanceSnapshot["status"]) {
  if (status === "healthy") return "default"
  if (status === "degraded") return "secondary"
  return "destructive"
}

export function PerformanceDashboard() {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadSnapshot = async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await getPerformanceSnapshot())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load performance metrics")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSnapshot()
    const interval = window.setInterval(loadSnapshot, 30000)
    return () => window.clearInterval(interval)
  }, [])

  const latencyData = useMemo(() => {
    if (!snapshot) return []
    return [
      { metric: "p50", value: snapshot.queryPerformance.p50Ms },
      { metric: "p95", value: snapshot.queryPerformance.p95Ms },
      { metric: "p99", value: snapshot.queryPerformance.p99Ms },
    ]
  }, [snapshot])

  if (loading && !snapshot) {
    return (
      <Card>
        <CardContent className="flex min-h-64 items-center justify-center">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading performance telemetry
        </CardContent>
      </Card>
    )
  }

  if (error && !snapshot) {
    return (
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Performance telemetry unavailable
          </CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={loadSnapshot}>Retry</Button>
        </CardContent>
      </Card>
    )
  }

  if (!snapshot) return null

  const heapPercent = Math.round(snapshot.capacityPlanning.heapUsedRatio * 100)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Performance Monitoring</h2>
          <p className="text-muted-foreground">
            Query latency, cache efficiency, system health, alerts, and capacity planning
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(snapshot.status)}>{snapshot.status.toUpperCase()}</Badge>
          <Button variant="outline" onClick={loadSnapshot} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Query p95</p>
                <p className="text-2xl font-bold">{formatDuration(snapshot.queryPerformance.p95Ms)}</p>
              </div>
              <Gauge className="h-5 w-5 text-blue-600" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              SLA {formatDuration(snapshot.sla.targets.queryP95Ms)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Cache hit rate</p>
                <p className="text-2xl font-bold">{formatPercent(snapshot.cache.overallHitRate)}</p>
              </div>
              <Database className="h-5 w-5 text-green-600" />
            </div>
            <Progress value={snapshot.cache.overallHitRate * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Error rate</p>
                <p className="text-2xl font-bold">{formatPercent(snapshot.sla.errorRate)}</p>
              </div>
              <Activity className="h-5 w-5 text-orange-600" />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshot.queryPerformance.errorCount} failed operations
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Heap usage</p>
                <p className="text-2xl font-bold">{heapPercent}%</p>
              </div>
              <Server className="h-5 w-5 text-purple-600" />
            </div>
            <Progress value={heapPercent} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Query latency distribution</CardTitle>
            <CardDescription>
              {snapshot.queryPerformance.totalQueries} tracked service operations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={latencyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" />
                <YAxis tickFormatter={(value) => `${value}ms`} />
                <Tooltip formatter={(value) => [formatDuration(Number(value)), "Latency"]} />
                <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">SLA tracking</CardTitle>
            <CardDescription>Live checks against performance targets</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ["Query p95 latency", snapshot.sla.queryP95WithinSla],
              ["Cache hit rate", snapshot.sla.cacheHitRateWithinSla],
              ["Operation error rate", snapshot.sla.errorRateWithinSla],
            ].map(([label, passing]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium">{label}</span>
                <Badge variant={passing ? "default" : "destructive"}>
                  {passing ? "Within SLA" : "Needs attention"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Performance alerts</CardTitle>
            <CardDescription>Recent degradation signals generated from telemetry</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.alerts.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                No active performance alerts
              </div>
            ) : (
              snapshot.alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{alert.message}</p>
                    <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                      {alert.severity}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.metric}: {alert.value} / target {alert.threshold}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif">Capacity planning</CardTitle>
            <CardDescription>
              Projected daily query volume: {snapshot.capacityPlanning.projectedDailyQueries.toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.capacityPlanning.recommendations.map((recommendation) => (
              <div key={recommendation} className="flex items-start gap-3 rounded-lg border p-3">
                <TrendingUp className="mt-0.5 h-4 w-4 text-blue-600" />
                <p className="text-sm">{recommendation}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
