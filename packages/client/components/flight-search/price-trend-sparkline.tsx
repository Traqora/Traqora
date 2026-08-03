"use client"

import { useEffect, useState } from "react"
import { TrendingDown, TrendingUp, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { getPriceTrend, PriceTrend } from "@/lib/api"

interface PriceTrendSparklineProps {
  from: string
  to: string
}

export function PriceTrendSparkline({ from, to }: PriceTrendSparklineProps) {
  const [trend, setTrend] = useState<PriceTrend | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (from.length !== 3 || to.length !== 3) {
      setTrend(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    getPriceTrend(from, to)
      .then((data) => {
        if (!cancelled) setTrend(data)
      })
      .catch(() => {
        if (!cancelled) setTrend(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [from, to])

  if (isLoading || !trend || trend.points.length < 2) return null

  const prices = trend.points.map((p) => p.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const width = 200
  const height = 40

  const coords = trend.points.map((point, i) => {
    const x = (i / (trend.points.length - 1)) * width
    const y = height - ((point.price - min) / range) * height
    return `${x},${y}`
  })

  const isUp = trend.changePercent > 0
  const isDown = trend.changePercent < 0
  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus
  const trendColor = isUp ? "text-red-500" : isDown ? "text-green-500" : "text-muted-foreground"

  return (
    <Card className="border-0 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-center gap-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {trend.from} → {trend.to} price trend
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-bold">${trend.currentPrice}</span>
            <span className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="h-3 w-3" />
              {Math.abs(trend.changePercent)}% over {trend.points.length}d
            </span>
          </div>
        </div>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="flex-1 max-w-[200px]"
          role="img"
          aria-label={`Price trend for ${trend.from} to ${trend.to}: ${trend.changePercent}% over ${trend.points.length} days`}
        >
          <polyline
            points={coords.join(" ")}
            fill="none"
            stroke={isUp ? "#ef4444" : isDown ? "#22c55e" : "#94a3b8"}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </CardContent>
    </Card>
  )
}
