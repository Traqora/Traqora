"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Plane,
  Shield,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  UserMinus,
  Loader2,
} from "lucide-react"
import { useVotingPower, useDelegations } from "@/hooks/governance/useGovernance"
import { useGovernanceStore } from "@/lib/stores/governance"
import { VotingPowerCard } from "@/components/governance/voting-power-card"
import { DelegationForm } from "@/components/governance/delegation-form"

export default function DelegatePage() {
  const store = useGovernanceStore()
  const { votingPower, loading: votingPowerLoading } = useVotingPower('current-user-address') // TODO: Get from wallet context
  const { delegations, loading: delegationsLoading } = useDelegations('current-user-address') // TODO: Get from wallet context
  const delegatedTo = Array.isArray((delegations as any)?.delegatedTo) ? (delegations as any).delegatedTo : []
  const delegatedBy = Array.isArray((delegations as any)?.delegatedBy) ? (delegations as any).delegatedBy : []
  const [isDelegating, setIsDelegating] = useState(false)
  const [isRevoking, setIsRevoking] = useState<string | null>(null)

  const handleDelegate = async (delegate: string, amount: number) => {
    setIsDelegating(true)
    const success = await store.delegate('current-user-address', delegate, amount) // TODO: Get from wallet context
    setIsDelegating(false)
    if (success) {
      // Refresh data
      store.refreshVotingPower('current-user-address')
      store.refreshDelegations('current-user-address')
    }
  }

  const handleRevokeDelegation = async (delegator: string) => {
    setIsRevoking(delegator)
    const success = await store.revokeDelegation(delegator)
    setIsRevoking(null)
    if (success) {
      // Refresh data
      store.refreshVotingPower('current-user-address')
      store.refreshDelegations('current-user-address')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">
            Manage Voting Power Delegation
          </h1>
          <p className="text-muted-foreground">
            Delegate your TRQ tokens to other community members or revoke existing delegations.
            Delegated tokens maintain their voting power but are controlled by the delegate.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delegation Form */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Create New Delegation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DelegationForm
                  currentDelegations={delegatedBy as any}
                  maxDelegatable={votingPower.baseBalance}
                  onDelegate={handleDelegate}
                  onRevoke={handleRevokeDelegation}
                />
              </CardContent>
            </Card>

            {/* Delegations Received */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5 text-green-500" />
                  Delegations Received
                </CardTitle>
              </CardHeader>
              <CardContent>
                {delegationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : delegatedTo.length > 0 ? (
                  <div className="space-y-4">
                    {delegatedTo.map((delegation: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <ArrowUpRight className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium">From {delegation.delegator}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(delegation.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium text-green-600">
                            +{delegation.amount.toLocaleString()} TRQ
                          </p>
                          <p className="text-sm text-muted-foreground">Delegated to you</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No delegations received yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Delegations Given */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <ArrowDownRight className="h-5 w-5 text-red-500" />
                  Delegations Given
                </CardTitle>
              </CardHeader>
              <CardContent>
                {delegationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : delegatedBy.length > 0 ? (
                  <div className="space-y-4">
                    {delegatedBy.map((delegation: any, index: number) => (
                      <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <ArrowDownRight className="h-5 w-5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium">To {delegation.delegate}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(delegation.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-medium text-red-600">
                              -{delegation.amount.toLocaleString()} TRQ
                            </p>
                            <p className="text-sm text-muted-foreground">Delegated away</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRevokeDelegation(delegation.delegator)}
                            disabled={isRevoking === delegation.delegator}
                          >
                            {isRevoking === delegation.delegator ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <UserMinus className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserMinus className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No delegations given yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <VotingPowerCard
              baseBalance={votingPower.baseBalance}
              delegatedToUser={votingPower.delegatedToUser}
              delegatedAway={votingPower.delegatedAway}
              totalVotingPower={votingPower.totalVotingPower}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Delegation Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  <strong>Delegating tokens</strong> allows others to vote with your TRQ tokens on your behalf.
                </p>
                <p>
                  You can revoke delegations at any time, but this requires a blockchain transaction.
                </p>
                <Separator />
                <p>
                  <strong>Benefits:</strong> Participate in governance even when you don't have time to vote on every proposal.
                </p>
                <p>
                  <strong>Risks:</strong> Your delegate votes according to their own judgment, which may not align with your views.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
