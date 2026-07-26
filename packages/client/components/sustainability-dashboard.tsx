"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import {
  Leaf,
  TreePine,
  Car,
  TrendingUp,
  Award,
  Download,
  ExternalLink,
  Calendar,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getCarbonStats, SustainabilityStats, getOffsetCertificate } from "@/lib/api"

interface SustainabilityDashboardProps {
  userId: string
  className?: string
}

export function SustainabilityDashboard({ userId, className }: SustainabilityDashboardProps) {
  const [stats, setStats] = useState<SustainabilityStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    getCarbonStats(userId)
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Failed to load sustainability stats")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [userId])

  const handleDownloadCertificate = async (purchaseId: string) => {
    setDownloadingId(purchaseId)
    try {
      const blob = await getOffsetCertificate(purchaseId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `carbon-certificate-${purchaseId}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Failed to download certificate", err)
    } finally {
      setDownloadingId(null)
    }
  }

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const formatKg = (kg: number) => {
    if (kg >= 1000) return `${(kg / 1000).toFixed(1)}t`
    return `${kg.toFixed(0)}kg`
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-6", className)}>
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <Card className={cn("border-destructive", className)}>
        <CardContent className="pt-6">
          <p className="text-destructive text-sm">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!stats) return null

  const statCards = [
    {
      label: "Total CO₂ Offset",
      value: formatKg(stats.totalCO2OffsetKg),
      icon: Leaf,
      color: "text-green-600",
      bg: "bg-green-50",
      border: "border-green-200",
    },
    {
      label: "Trees Equivalent",
      value: stats.treesEquivalent.toLocaleString(),
      icon: TreePine,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
    },
    {
      label: "Cars Off Road",
      value: stats.carsOffRoadEquivalent.toLocaleString(),
      icon: Car,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
    {
      label: "Total Spent",
      value: formatCents(stats.totalOffsetCents),
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "border-purple-200",
    },
  ]

  const treesProgress = Math.min((stats.treesEquivalent / 100) * 100, 100)
  const co2Progress = Math.min((stats.totalCO2OffsetKg / 10000) * 100, 100)

  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex items-center gap-3">
        <Leaf className="h-7 w-7 text-green-600" />
        <div>
          <h2 className="text-2xl font-bold">Sustainability Impact</h2>
          <p className="text-sm text-muted-foreground">
            Your contribution to a cleaner planet
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto text-sm px-3 py-1">
          {stats.totalPurchases} purchase{stats.totalPurchases !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.label} className={cn("border", card.border)}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className={cn("text-2xl font-bold mt-1", card.color)}>{card.value}</p>
                </div>
                <div className={cn("p-2 rounded-full", card.bg)}>
                  <card.icon className={cn("h-5 w-5", card.color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TreePine className="h-4 w-4 text-green-600" />
              Tree Planting Progress
            </CardTitle>
            <CardDescription>
              {stats.treesEquivalent} trees equivalent — Goal: 100 trees
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={treesProgress} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              {100 - stats.treesEquivalent > 0
                ? `${100 - stats.treesEquivalent} more trees to reach 100`
                : "Goal reached! 🎉"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-600" />
              CO₂ Reduction Progress
            </CardTitle>
            <CardDescription>
              {formatKg(stats.totalCO2OffsetKg)} offset — Goal: 10,000 kg
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={co2Progress} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              {stats.totalCO2OffsetKg < 10000
                ? `${formatKg(10000 - stats.totalCO2OffsetKg)} more to reach 10,000 kg`
                : "Goal reached!"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Award className="h-4 w-4 text-green-600" />
            Recent Offset Purchases
          </CardTitle>
          <CardDescription>
            {stats.projectsSupported} project{stats.projectsSupported !== 1 ? "s" : ""} supported
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentPurchases.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No offset purchases yet. Offset your next flight!
            </p>
          ) : (
            <div className="space-y-3">
              {stats.recentPurchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-50">
                      <Leaf className="h-4 w-4 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {formatKg(purchase.co2Kg)} CO₂
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(purchase.createdAt).toLocaleDateString()}
                        <Badge variant="outline" className="text-[10px] px-1">
                          {purchase.tonsOffset} ton(s)
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{formatCents(purchase.amountCents)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownloadCertificate(purchase.id)}
                      disabled={downloadingId === purchase.id}
                      title="Download Certificate"
                    >
                      <Download className={cn(
                        "h-4 w-4",
                        downloadingId === purchase.id && "animate-pulse"
                      )} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
