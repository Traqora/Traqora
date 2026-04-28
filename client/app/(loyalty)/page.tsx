"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Trophy,
  Star,
  Gift,
  History,
  TrendingUp,
  ArrowLeft,
  Coins,
  Target,
  Award,
} from "lucide-react"
import { LoyaltySummaryCard } from "@/components/loyalty/LoyaltySummaryCard"
import { PointsHistoryTable } from "@/components/loyalty/PointsHistoryTable"
import { RedeemPointsForm } from "@/components/loyalty/RedeemPointsForm"
import { ReferralInvite } from "@/components/loyalty/ReferralInvite"
import { TierProgress } from "@/components/loyalty/TierProgress"
import { TierBenefits } from "@/components/loyalty/TierBenefits"
import { useLoyaltySummary } from "@/hooks/loyalty/useLoyaltySummary"
import { usePointsHistory } from "@/hooks/loyalty/usePointsHistory"
import { NavWalletButton } from "@/components/nav-wallet-button"

export default function LoyaltyPage() {
  const [activeTab, setActiveTab] = useState("overview")
  const { data: summary, isLoading: summaryLoading, upgradeCelebration } = useLoyaltySummary()
  const history = usePointsHistory()

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Trophy className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/search" className="text-muted-foreground hover:text-foreground transition-colors">
                Search Flights
              </Link>
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Badge variant="secondary" className="px-3 py-1">
                <Star className="h-4 w-4 mr-2 text-primary" />
                Loyalty
              </Badge>
              <NavWalletButton />
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Loyalty Program</h1>
            <p className="text-muted-foreground">
              Earn points on every flight, unlock exclusive benefits, and redeem for amazing rewards
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/loyalty/referral">
              <Button variant="outline">
                <Gift className="h-4 w-4 mr-2" />
                Invite Friends
              </Button>
            </Link>
            <Link href="/loyalty/rewards">
              <Button>
                <Award className="h-4 w-4 mr-2" />
                View Rewards
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Current Tier</p>
                  <p className="text-2xl font-bold">{summaryLoading ? "..." : summary?.tier ?? "Bronze"}</p>
                </div>
                <Trophy className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Points Balance</p>
                  <p className="text-2xl font-bold">{summaryLoading ? "..." : summary?.points?.toLocaleString() ?? 0}</p>
                </div>
                <Coins className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Next Tier Progress</p>
                  <p className="text-2xl font-bold">{summaryLoading ? "..." : `${summary?.progressPct ?? 0}%`}</p>
                </div>
                <Target className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Points This Month</p>
                  <p className="text-2xl font-bold">+2,450</p>
                </div>
                <TrendingUp className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="history">Transaction History</TabsTrigger>
                <TabsTrigger value="redeem">Redeem Points</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <LoyaltySummaryCard
                    summary={summary}
                    loading={summaryLoading}
                    upgradeCelebration={upgradeCelebration}
                  />
                  <TierProgress summary={summary} loading={summaryLoading} />
                </div>
                <TierBenefits tier={summary?.tier} />
                <ReferralInvite />
              </TabsContent>

              <TabsContent value="history" className="space-y-6">
                <PointsHistoryTable history={history} />
              </TabsContent>

              <TabsContent value="redeem" className="space-y-6">
                <RedeemPointsForm />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Gift className="h-4 w-4 mr-2" />
                  Redeem Points
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <History className="h-4 w-4 mr-2" />
                  View History
                </Button>
                <Button variant="outline" className="w-full justify-start" size="sm">
                  <Trophy className="h-4 w-4 mr-2" />
                  Tier Benefits
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Flight booking reward</p>
                    <p className="text-xs text-muted-foreground">+250 points • 2 hours ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Tier upgrade</p>
                    <p className="text-xs text-muted-foreground">Silver tier unlocked • 1 day ago</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Referral bonus</p>
                    <p className="text-xs text-muted-foreground">+100 points • 3 days ago</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}