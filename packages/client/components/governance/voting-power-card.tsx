"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Coins, ArrowUpRight, ArrowDownRight, Zap } from "lucide-react"

interface VotingPowerCardProps {
  baseBalance: number
  delegatedToUser: number
  delegatedAway: number
  totalVotingPower: number
}

export function VotingPowerCard({
  baseBalance,
  delegatedToUser,
  delegatedAway,
  totalVotingPower,
}: VotingPowerCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif">
          <Zap className="h-5 w-5 text-primary" />
          Voting Power
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Power */}
        <div className="text-center p-4 bg-primary/10 rounded-lg">
          <p className="text-3xl font-bold text-primary">{totalVotingPower.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Total Voting Power</p>
        </div>

        {/* Breakdown */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Coins className="h-4 w-4" />
              TRQ Balance
            </span>
            <Badge variant="secondary">{baseBalance.toLocaleString()} TRQ</Badge>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowUpRight className="h-4 w-4 text-green-500" />
              Delegated to You
            </span>
            <Badge variant="secondary" className="text-green-600">
              +{delegatedToUser.toLocaleString()} TRQ
            </Badge>
          </div>

          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <ArrowDownRight className="h-4 w-4 text-red-500" />
              Delegated Away
            </span>
            <Badge variant="secondary" className="text-red-600">
              -{delegatedAway.toLocaleString()} TRQ
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
