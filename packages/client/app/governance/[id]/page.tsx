"use client"

import { useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Plane,
  Shield,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  Users,
  ExternalLink,
  CheckCircle,
  XCircle,
  Timer,
  User,
  Zap,
  BarChart3,
} from "lucide-react"
import { useProposal, useVotingPower } from "@/hooks/governance/useGovernance"
import { useGovernanceStore } from "@/lib/stores/governance"
import { VoteDialog } from "@/components/governance/vote-dialog"
import { CountdownTimer } from "@/components/governance/countdown-timer"
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <Timer className="h-3 w-3 mr-1" />
          Active
        </Badge>
      )
    case "passed":
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Passed
        </Badge>
      )
    case "rejected":
      return (
        <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
          <XCircle className="h-3 w-3 mr-1" />
          Rejected
        </Badge>
      )
    case "executed":
      return (
        <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
          <CheckCircle className="h-3 w-3 mr-1" />
          Executed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case "fee_change":
      return <Badge variant="outline">Fee Change</Badge>
    case "feature":
      return <Badge variant="outline">Feature</Badge>
    case "upgrade":
      return <Badge variant="outline">Upgrade</Badge>
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

export default function ProposalDetailPage() {
  const params = useParams()
  const proposalId = parseInt(params.id as string)
  const { proposal, votes, loading } = useProposal(proposalId)
  const { votingPower } = useVotingPower('current-user-address') // TODO: Get from wallet context
  const store = useGovernanceStore()
  const [showVoteDialog, setShowVoteDialog] = useState(false)

  if (loading || !proposal) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  const totalVotes = proposal.yesVotes + proposal.noVotes
  const yesPercent = totalVotes > 0 ? (proposal.yesVotes / totalVotes) * 100 : 0
  const quorumPercent = proposal.quorum > 0 ? Math.min((totalVotes / proposal.quorum) * 100, 100) : 0

  // Data for pie chart
  const voteData = [
    { name: 'Yes', value: proposal.yesVotes, color: '#22c55e' },
    { name: 'No', value: proposal.noVotes, color: '#ef4444' },
  ]

  // Data for voting power distribution
  const votingPowerData = votes.map(vote => ({
    voter: vote.voter.substring(0, 8) + '...',
    power: vote.votingPower,
    support: vote.support ? 'Yes' : 'No'
  }))

  const handleVote = async (support: boolean) => {
    const success = await store.castVote(proposalId, support, votingPower.totalVotingPower)
    if (success) {
      setShowVoteDialog(false)
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

        {/* Proposal Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {getStatusBadge(proposal.status)}
                {getTypeBadge(proposal.proposalType)}
              </div>
              <h1 className="font-serif font-bold text-3xl text-foreground mb-2">
                {proposal.title}
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  Proposed by {proposal.proposer}
                </span>
                <span className="flex items-center gap-1">
                  <Timer className="h-4 w-4" />
                  <CountdownTimer endDate={proposal.votingEnd} />
                </span>
              </div>
            </div>
            {proposal.status === 'active' && (
              <Button onClick={() => setShowVoteDialog(true)} size="lg">
                <Zap className="h-4 w-4 mr-2" />
                Cast Vote
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Proposal Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground whitespace-pre-line">
                  {proposal.description}
                </p>
              </CardContent>
            </Card>

            {/* Voting Results */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Voting Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Vote Distribution Pie Chart */}
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={voteData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {voteData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value.toLocaleString(), 'Votes']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Vote Progress */}
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="flex items-center gap-1 text-green-600">
                      <ThumbsUp className="h-3 w-3" />
                      Yes ({yesPercent.toFixed(1)}%) - {proposal.yesVotes.toLocaleString()} votes
                    </span>
                    <span className="flex items-center gap-1 text-red-600">
                      No ({(100 - yesPercent).toFixed(1)}%) - {proposal.noVotes.toLocaleString()} votes
                      <ThumbsDown className="h-3 w-3" />
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-red-200 overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all"
                      style={{ width: `${yesPercent}%` }}
                    />
                  </div>
                </div>

                {/* Quorum Progress */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Quorum Progress</span>
                    <span>{quorumPercent.toFixed(1)}% ({totalVotes.toLocaleString()}/{proposal.quorum.toLocaleString()})</span>
                  </div>
                  <Progress value={quorumPercent} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Recent Votes */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Recent Votes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {votes.slice(0, 10).map((vote, index) => (
                    <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${vote.support ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="font-mono text-sm">{vote.voter}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">{vote.votingPower.toLocaleString()} TRQ</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(vote.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Voting Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Voting Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Votes</span>
                  <span className="font-medium">{totalVotes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Unique Voters</span>
                  <span className="font-medium">{proposal.totalVoters}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Quorum Required</span>
                  <span className="font-medium">{proposal.quorum.toLocaleString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Your Voting Power</span>
                  <span className="font-medium">{votingPower.totalVotingPower.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Voting Power Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Top Voters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={votingPowerData.slice(0, 5)}>
                      <XAxis dataKey="voter" />
                      <YAxis />
                      <Tooltip formatter={(value) => [value.toLocaleString(), 'Voting Power']} />
                      <Bar dataKey="power" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Vote Dialog */}
      <VoteDialog
        open={showVoteDialog}
        onOpenChange={setShowVoteDialog}
        proposal={proposal}
        votingPower={votingPower.totalVotingPower}
        onVote={handleVote}
      />
    </div>
  )
}
