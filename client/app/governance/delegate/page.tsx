"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plane,
  Shield,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Users,
} from "lucide-react"
import { VotingPowerCard } from "@/components/governance/voting-power-card"
import { DelegationForm } from "@/components/governance/delegation-form"

// Mock data
const mockVotingPower = {
  baseBalance: 850,
  delegatedToUser: 300,
  delegatedAway: 0,
  totalVotingPower: 1150,
}

const mockDelegationsBy = [
  {
    delegator: "GBXYZ...USER1",
    delegate: "GBXYZ...USER5",
    amount: 200,
    timestamp: "2026-01-15T10:00:00Z",
  },
]

const mockDelegationsTo = [
  {
    delegator: "GBXYZ...USER4",
    delegate: "GBXYZ...USER1",
    amount: 300,
    timestamp: "2026-01-20T14:30:00Z",
  },
]

export default function DelegatePage() {
  const [delegationsBy, setDelegationsBy] = useState(mockDelegationsBy)

  const handleDelegate = (delegate: string, amount: number) => {
    const newDelegation = {
      delegator: "GBXYZ...USER1",
      delegate,
      amount,
      timestamp: new Date().toISOString(),
    }
    setDelegationsBy([...delegationsBy, newDelegation])
  }

  const handleRevoke = (delegator: string) => {
    setDelegationsBy(delegationsBy.filter((d) => d.delegator !== delegator))
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Link href="/governance" className="text-muted-foreground hover:text-foreground transition-colors">
                Governance
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Link */}
        <Link
          href="/governance"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Governance
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Delegation Management</h1>
          <p className="text-muted-foreground">
            Delegate your TRQ voting power to trusted representatives or manage incoming delegations
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delegate Your Power */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5 text-primary" />
                  Delegate Your Voting Power
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DelegationForm
                  currentDelegations={delegationsBy}
                  maxDelegatable={mockVotingPower.baseBalance}
                  onDelegate={handleDelegate}
                  onRevoke={handleRevoke}
                />
              </CardContent>
            </Card>

            {/* Delegations Received */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <ArrowDownRight className="h-5 w-5 text-green-500" />
                  Delegations Received
                </CardTitle>
              </CardHeader>
              <CardContent>
                {mockDelegationsTo.length > 0 ? (
                  <div className="space-y-3">
                    {mockDelegationsTo.map((delegation, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-mono">{delegation.delegator}</p>
                            <p className="text-xs text-muted-foreground">
                              Delegated on {new Date(delegation.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="text-green-600">
                          +{delegation.amount.toLocaleString()} TRQ
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No one has delegated voting power to you yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* How Delegation Works */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  How Delegation Works
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  Delegation allows you to transfer your voting power to another address without transferring your TRQ tokens.
                </p>
                <ul className="space-y-2 list-disc list-inside">
                  <li>Your TRQ tokens remain in your wallet at all times</li>
                  <li>The delegate votes on your behalf with your delegated power</li>
                  <li>You can revoke delegation at any time</li>
                  <li>Delegating to a new address automatically revokes the previous delegation</li>
                  <li>Delegated power is added to the delegate&apos;s own voting power</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <VotingPowerCard
              baseBalance={mockVotingPower.baseBalance}
              delegatedToUser={mockVotingPower.delegatedToUser}
              delegatedAway={mockVotingPower.delegatedAway}
              totalVotingPower={mockVotingPower.totalVotingPower}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
