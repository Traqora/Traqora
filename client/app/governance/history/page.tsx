"use client"

import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plane,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  History,
  CheckCircle,
  XCircle,
  Timer,
} from "lucide-react"

// Mock voting history
const mockVotingHistory = [
  {
    proposalId: 1,
    proposalTitle: "Reduce Platform Fee to 0%",
    proposalStatus: "active",
    support: true,
    votingPower: 1150,
    timestamp: "2026-02-02T10:30:00Z",
    outcome: null,
  },
  {
    proposalId: 2,
    proposalTitle: "Add Multi-City Booking Support",
    proposalStatus: "passed",
    support: true,
    votingPower: 850,
    timestamp: "2026-01-21T11:00:00Z",
    outcome: "passed",
  },
  {
    proposalId: 3,
    proposalTitle: "Upgrade Soroban Contract to v2",
    proposalStatus: "rejected",
    support: false,
    votingPower: 850,
    timestamp: "2026-01-12T08:45:00Z",
    outcome: "rejected",
  },
  {
    proposalId: 4,
    proposalTitle: "Increase Loyalty Rewards by 20%",
    proposalStatus: "active",
    support: true,
    votingPower: 1150,
    timestamp: "2026-02-11T13:20:00Z",
    outcome: null,
  },
]

function getProposalStatusBadge(status: string) {
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

function getOutcomeBadge(outcome: string | null, support: boolean) {
  if (!outcome) {
    return <Badge variant="outline">Pending</Badge>
  }

  const won =
    (outcome === "passed" && support) || (outcome === "rejected" && !support)

  return won ? (
    <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
      Won
    </Badge>
  ) : (
    <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
      Lost
    </Badge>
  )
}

export default function VotingHistoryPage() {
  const totalVotes = mockVotingHistory.length
  const yesVotes = mockVotingHistory.filter((v) => v.support).length
  const noVotes = mockVotingHistory.filter((v) => !v.support).length
  const totalPowerUsed = mockVotingHistory.reduce((sum, v) => sum + v.votingPower, 0)

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
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Voting History</h1>
          <p className="text-muted-foreground">Your complete voting record across all governance proposals</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{totalVotes}</p>
              <p className="text-xs text-muted-foreground">Total Votes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{yesVotes}</p>
              <p className="text-xs text-muted-foreground">Yes Votes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{noVotes}</p>
              <p className="text-xs text-muted-foreground">No Votes</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{totalPowerUsed.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Power Used</p>
            </CardContent>
          </Card>
        </div>

        {/* Vote History List */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <History className="h-5 w-5" />
              All Votes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mockVotingHistory.length > 0 ? (
              <div className="space-y-4">
                {mockVotingHistory.map((vote, index) => (
                  <Link key={index} href={`/governance/${vote.proposalId}`}>
                    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                            vote.support ? "bg-green-100" : "bg-red-100"
                          }`}
                        >
                          {vote.support ? (
                            <ThumbsUp className="h-5 w-5 text-green-600" />
                          ) : (
                            <ThumbsDown className="h-5 w-5 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{vote.proposalTitle}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {getProposalStatusBadge(vote.proposalStatus)}
                            <span className="text-xs text-muted-foreground">
                              Voted on {new Date(vote.timestamp).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className="text-sm font-medium">{vote.votingPower.toLocaleString()} TRQ</p>
                          <p className="text-xs text-muted-foreground">
                            Voted {vote.support ? "Yes" : "No"}
                          </p>
                        </div>
                        {getOutcomeBadge(vote.outcome, vote.support)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No voting history yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Cast your first vote on an active proposal
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
