"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Crown,
  Zap,
  Gift,
  Luggage,
  Hotel,
  Car,
  Plane,
  Coffee,
  Star,
  ChevronRight,
  Calendar,
  TrendingUp,
} from "lucide-react"

interface TierBenefit {
  id: string
  description: string
  icon?: string
}

interface TierInfo {
  tier: string
  name: string
  minPoints: number
  benefits: TierBenefit[]
  color: string
}

interface TierProgression {
  currentTier: TierInfo
  nextTier: TierInfo | null
  pointsRemaining: number
  progressPercent: number
}

interface TierHistoryEntry {
  tier: string
  name: string
  changedAt: Date
}

interface TierBenefitsProps {
  progression: TierProgression
  history: TierHistoryEntry[]
  currentPoints: number
}

const iconMap: Record<string, React.ReactNode> = {
  points: <Zap className="h-4 w-4" />,
  gift: <Gift className="h-4 w-4" />,
  cake: <Star className="h-4 w-4" />,
  support: <Coffee className="h-4 w-4" />,
  seat: <Plane className="h-4 w-4" />,
  lounge: <Crown className="h-4 w-4" />,
  luggage: <Luggage className="h-4 w-4" />,
  "check-circle": <ChevronRight className="h-4 w-4" />,
  hotel: <Hotel className="h-4 w-4" />,
  car: <Car className="h-4 w-4" />,
  concierge: <Crown className="h-4 w-4" />,
  percent: <TrendingUp className="h-4 w-4" />,
}

export function TierBenefits({ progression, history, currentPoints }: TierBenefitsProps) {
  const { currentTier, nextTier, pointsRemaining, progressPercent } = progression

  return (
    <div className="space-y-6">
      {/* Current Tier Card */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif flex items-center gap-2">
            <Crown className="h-5 w-5" style={{ color: currentTier.color }} />
            Current Tier: {currentTier.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {currentPoints.toLocaleString()} points
            </span>
            {nextTier ? (
              <span className="text-muted-foreground">
                {pointsRemaining.toLocaleString()} points to {nextTier.name}
              </span>
            ) : (
              <span className="text-muted-foreground">Maximum tier reached</span>
            )}
          </div>

          {nextTier && (
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-2" />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{currentTier.name}</span>
                <span>{nextTier.name}</span>
              </div>
            </div>
          )}

          <div className="pt-2">
            <p className="text-sm font-medium mb-2">Your Benefits</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {currentTier.benefits.map((benefit) => (
                <div
                  key={benefit.id}
                  className="flex items-start gap-2 text-sm text-muted-foreground"
                >
                  <span className="mt-0.5" style={{ color: currentTier.color }}>
                    {iconMap[benefit.icon || 'gift']}
                  </span>
                  <span>{benefit.description}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All Tiers Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">All Loyalty Tiers</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={currentTier.tier} className="space-y-4">
            <TabsList className="grid grid-cols-5">
              {TIERS.map((tier: TierInfo) => (
                <TabsTrigger
                  key={tier.tier}
                  value={tier.tier}
                  className="text-xs"
                  disabled={currentPoints < tier.minPoints && tier.tier !== currentTier.tier}
                >
                  {tier.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {TIERS.map((tier: TierInfo) => (
              <TabsContent key={tier.tier} value={tier.tier} className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: tier.color }}
                    />
                    <h3 className="font-serif font-semibold">{tier.name} Tier</h3>
                  </div>
                  <Badge variant="secondary">
                    {tier.minPoints.toLocaleString()} points required
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-3">
                  {tier.benefits.map((benefit: TierBenefit) => (
                    <div
                      key={benefit.id}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <div className="mt-0.5" style={{ color: tier.color }}>
                        {iconMap[benefit.icon || 'gift']}
                      </div>
                      <span className="text-sm">{benefit.description}</span>
                    </div>
                  ))}
                </div>

                {currentPoints >= tier.minPoints && tier.tier !== currentTier.tier && (
                  <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
                    ✓ You have unlocked this tier
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Tier History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tier Progression History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {history.map((entry: TierHistoryEntry, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: TIERS.find((t: TierInfo) => t.tier === entry.tier)?.color || '#ccc',
                      }}
                    />
                    <span className="font-medium">{entry.name}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {new Date(entry.changedAt).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Import tier data
import { TIERS } from '@/lib/loyalty-tier-data'
