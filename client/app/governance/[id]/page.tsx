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
} from "lucide-react"
import { VoteDialog } from "@/components/governance/vote-dialog"
import { CountdownTimer } from "@/components/governance/countdown-timer"

// Mock proposals data (same as listing page)
const mockProposals = [
  {
    id: 1,
    proposer: "GBXYZ...ADMIN1",
    title: "Reduce Platform Fee to 0%",
    description:
      "Proposal to eliminate all platform fees for the first year to drive adoption and onboard more airlines and travelers to the Traqora ecosystem. This would mean zero fees on all bookings, refunds, and loyalty redemptions for 12 months starting from the date of execution.\n\nThe goal is to accelerate user acquisition and establish Traqora as the go-to decentralized travel platform. After the initial period, a community vote will determine the new fee structure.",
    proposalType: "fee_change",
    votingStart: "2026-02-01T00:00:00Z",
    votingEnd: "2026-03-15T00:00:00Z",
    yesVotes: 12500,
    noVotes: 3200,
    status: "active",
    executed: false,
    quorum: 10000,
    totalVoters: 47,
  },
  {
    id: 2,
    proposer: "GBXYZ...ADMIN2",
    title: "Add Multi-City Booking Support",
    description:
      "Enable users to book multi-city itineraries in a single transaction, with smart contract support for linked bookings and combined refund logic. This feature has been requested by 73% of surveyed users.",
    proposalType: "feature",
    votingStart: "2026-01-20T00:00:00Z",
    votingEnd: "2026-02-03T00:00:00Z",
    yesVotes: 18700,
    noVotes: 1100,
    status: "passed",
    executed: true,
    quorum: 10000,
    totalVoters: 82,
  },
  {
    id: 3,
    proposer: "GBXYZ...ADMIN1",
    title: "Upgrade Soroban Contract to v2",
    description:
      "Migrate all smart contracts to Soroban SDK v22 for improved performance, lower gas costs, and access to new storage primitives.",
    proposalType: "upgrade",
    votingStart: "2026-01-10T00:00:00Z",
    votingEnd: "2026-01-24T00:00:00Z",
    yesVotes: 5200,
    noVotes: 8900,
    status: "rejected",
    executed: false,
    quorum: 10000,
    totalVoters: 63,
  },
  {
    id: 4,
    proposer: "GBXYZ...USER3",
    title: "Increase Loyalty Rewards by 20%",
    description:
      "Boost TRQ token rewards for all bookings by 20% to incentivize platform usage and reward loyal travelers.",
    proposalType: "feature",
    votingStart: "2026-02-10T00:00:00Z",
    votingEnd: "2026-03-24T00:00:00Z",
    yesVotes: 7800,
    noVotes: 2100,
    status: "active",
    executed: false,
    quorum: 10000,
    totalVoters: 35,
  },
  {
    id: 5,
    proposer: "GBXYZ...ADMIN2",
    title: "Partner with Regional Airlines",
    description:
      "Allocate 50,000 TRQ from the treasury to fund onboarding partnerships with 10 regional airlines across Southeast Asia and Africa.",
    proposalType: "feature",
    votingStart: "2026-02-15T00:00:00Z",
    votingEnd: "2026-04-01T00:00:00Z",
    yesVotes: 950,
    noVotes: 200,
    status: "active",
    executed: false,
    quorum: 10000,
    totalVoters: 12,
  },
]

const mockVoteHistory = [
  { voter: "GBXYZ...USER1", support: true, votingPower: 850, timestamp: "2026-02-02T10:30:00Z" },
  { voter: "GBXYZ...USER2", support: false, votingPower: 1200, timestamp: "2026-02-03T14:15:00Z" },
  { voter: "GBXYZ...USER3", support: true, votingPower: 500, timestamp: "2026-02-04T09:00:00Z" },
  { voter: "GBXYZ...USER4", support: true, votingPower: 2300, timestamp: "2026-02-05T11:45:00Z" },
  { voter: "GBXYZ...USER5", support: false, votingPower: 750, timestamp: "2026-02-06T16:20:00Z" },
  { voter: "GBXYZ...USER6", support: true, votingPower: 1800, timestamp: "2026-02-07T08:10:00Z" },
]

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
  const [hasVoted, setHasVoted] = useState(false)
  const [userVote, setUserVote] = useState<boolean | null>(null)

  const proposal = mockProposals.find((p) => p.id === proposalId)

  if (!proposal) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="font-serif font-bold text-xl mb-2">Proposal Not Found</h2>
            <p className="text-muted-foreground mb-4">The proposal you are looking for does not exist.</p>
            <Link href="/governance">
              <Button>Back to Proposals</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalVotes = proposal.yesVotes + proposal.noVotes
  const yesPercent = totalVotes > 0 ? (proposal.yesVotes / totalVotes) * 100 : 0
  const noPercent = totalVotes > 0 ? (proposal.noVotes / totalVotes) * 100 : 0
  const quorumPercent = proposal.quorum > 0 ? Math.min((totalVotes / proposal.quorum) * 100, 100) : 0
  const quorumReached = totalVotes >= proposal.quorum

  const handleVote = (support: boolean) => {
    setHasVoted(true)
    setUserVote(support)
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
          Back to Proposals
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Proposal Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  {getStatusBadge(proposal.status)}
                  {getTypeBadge(proposal.proposalType)}
                  <Badge variant="outline" className="text-xs">
                    #{proposal.id}
                  </Badge>
                </div>

                <h1 className="font-serif font-bold text-2xl text-foreground mb-4">{proposal.title}</h1>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                  <span className="flex items-center gap-1">
                    <User className="h-4 w-4" />
                    Proposed by {proposal.proposer}
                  </span>
                  <span>
                    Started {new Date(proposal.votingStart).toLocaleDateString()}
                  </span>
                </div>

                <Separator className="mb-6" />

                <div className="prose prose-sm max-w-none">
                  {proposal.description.split("\n\n").map((paragraph, index) => (
                    <p key={index} className="text-muted-foreground mb-4 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Voting Results */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Voting Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Yes/No Bar */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <ThumbsUp className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-600">Yes</span>
                    </div>
                    <span className="text-sm font-medium">
                      {proposal.yesVotes.toLocaleString()} votes ({yesPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all"
                      style={{ width: `${yesPercent}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <ThumbsDown className="h-4 w-4 text-red-600" />
                      <span className="font-medium text-red-600">No</span>
                    </div>
                    <span className="text-sm font-medium">
                      {proposal.noVotes.toLocaleString()} votes ({noPercent.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-red-500 rounded-full transition-all"
                      style={{ width: `${noPercent}%` }}
                    />
                  </div>
                </div>

                <Separator />

                {/* Quorum */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Quorum Progress</span>
                    <span className="font-medium">
                      {totalVotes.toLocaleString()} / {proposal.quorum.toLocaleString()}
                      {quorumReached && (
                        <CheckCircle className="h-4 w-4 text-green-500 inline ml-1" />
                      )}
                    </span>
                  </div>
                  <Progress value={quorumPercent} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {quorumReached
                      ? "Quorum has been reached"
                      : `${(proposal.quorum - totalVotes).toLocaleString()} more votes needed for quorum`}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Vote History */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Recent Votes ({proposal.totalVoters})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockVoteHistory.map((vote, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            vote.support ? "bg-green-100" : "bg-red-100"
                          }`}
                        >
                          {vote.support ? (
                            <ThumbsUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <ThumbsDown className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-mono">{vote.voter}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(vote.timestamp).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary">{vote.votingPower.toLocaleString()} TRQ</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Cast Vote */}
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Cast Your Vote
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasVoted ? (
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="font-medium">Vote Submitted</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      You voted {userVote ? "Yes" : "No"} with 1,150 TRQ
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm text-muted-foreground">Your Voting Power</span>
                      <span className="font-semibold flex items-center gap-1">
                        <Zap className="h-4 w-4 text-amber-500" />
                        1,150 TRQ
                      </span>
                    </div>
                    <VoteDialog
                      proposalId={proposal.id}
                      proposalTitle={proposal.title}
                      votingPower={1150}
                      onVote={handleVote}
                      hasVoted={hasVoted}
                      disabled={proposal.status !== "active"}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Proposal Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Proposal Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Proposal ID</span>
                  <span className="font-mono">#{proposal.id}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Type</span>
                  {getTypeBadge(proposal.proposalType)}
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Voting Started</span>
                  <span>{new Date(proposal.votingStart).toLocaleDateString()}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Voting Ends</span>
                  <span>{new Date(proposal.votingEnd).toLocaleDateString()}</span>
                </div>
                <Separator />
                {proposal.status === "active" && (
                  <>
                    <div className="flex justify-between text-sm items-center">
                      <span className="text-muted-foreground">Time Remaining</span>
                      <CountdownTimer targetDate={proposal.votingEnd} showIcon={false} />
                    </div>
                    <Separator />
                  </>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Voters</span>
                  <span>{proposal.totalVoters}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Executed</span>
                  <span>{proposal.executed ? "Yes" : "No"}</span>
                </div>
              </CardContent>
            </Card>

            {/* View on Explorer */}
            <Button variant="outline" className="w-full">
              <ExternalLink className="h-4 w-4 mr-2" />
              View on Stellar Expert
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
