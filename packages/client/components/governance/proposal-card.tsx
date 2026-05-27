"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Clock,
  Users,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  CheckCircle,
  XCircle,
  Timer,
} from "lucide-react"

export interface ProposalData {
  id: number
  proposer: string
  title: string
  description: string
  proposalType: string
  votingStart: string
  votingEnd: string
  yesVotes: number
  noVotes: number
  status: string
  executed: boolean
  quorum: number
  totalVoters: number
}

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

function getTimeRemaining(votingEnd: string): string {
  const now = new Date()
  const end = new Date(votingEnd)
  const diff = end.getTime() - now.getTime()

  if (diff <= 0) return "Ended"

  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

  if (days > 0) return `${days}d ${hours}h remaining`
  if (hours > 0) return `${hours}h remaining`

  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  return `${minutes}m remaining`
}

export function ProposalCard({ proposal }: { proposal: ProposalData }) {
  const totalVotes = proposal.yesVotes + proposal.noVotes
  const yesPercent = totalVotes > 0 ? (proposal.yesVotes / totalVotes) * 100 : 0
  const quorumPercent = proposal.quorum > 0 ? Math.min((totalVotes / proposal.quorum) * 100, 100) : 0

  return (
    <Link href={`/governance/${proposal.id}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusBadge(proposal.status)}
                  {getTypeBadge(proposal.proposalType)}
                </div>
                <h3 className="font-serif font-bold text-lg text-foreground">{proposal.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{proposal.description}</p>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Vote Progress */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="flex items-center gap-1 text-green-600">
                  <ThumbsUp className="h-3 w-3" />
                  {yesPercent.toFixed(1)}% Yes ({proposal.yesVotes.toLocaleString()})
                </span>
                <span className="flex items-center gap-1 text-red-600">
                  {(100 - yesPercent).toFixed(1)}% No ({proposal.noVotes.toLocaleString()})
                  <ThumbsDown className="h-3 w-3" />
                </span>
              </div>
              <div className="relative h-2 rounded-full bg-red-200 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all"
                  style={{ width: `${yesPercent}%` }}
                />
              </div>
            </div>

            {/* Footer Stats */}
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {proposal.totalVoters} voters
                </span>
                <span className="flex items-center gap-1">
                  Quorum: {quorumPercent.toFixed(0)}%
                </span>
              </div>
              {proposal.status === "active" && (
                <span className="flex items-center gap-1 text-amber-600">
                  <Clock className="h-3 w-3" />
                  {getTimeRemaining(proposal.votingEnd)}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
