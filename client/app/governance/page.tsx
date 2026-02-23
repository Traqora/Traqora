"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plane,
  Shield,
  Plus,
  Zap,
  Users,
  CheckCircle,
  Vote,
  History,
  ArrowLeft,
} from "lucide-react"
import { ProposalCard } from "@/components/governance/proposal-card"
import type { ProposalData } from "@/components/governance/proposal-card"
import { VotingPowerCard } from "@/components/governance/voting-power-card"

// Mock proposals data
const mockProposals: ProposalData[] = [
  {
    id: 1,
    proposer: "GBXYZ...ADMIN1",
    title: "Reduce Platform Fee to 0%",
    description:
      "Proposal to eliminate all platform fees for the first year to drive adoption and onboard more airlines and travelers to the Traqora ecosystem.",
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
      "Enable users to book multi-city itineraries in a single transaction, with smart contract support for linked bookings and combined refund logic.",
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

// Mock voting power
const mockVotingPower = {
  baseBalance: 850,
  delegatedToUser: 300,
  delegatedAway: 0,
  totalVotingPower: 1150,
}

export default function GovernancePage() {
  const [activeTab, setActiveTab] = useState("all")

  const activeProposals = mockProposals.filter((p) => p.status === "active")
  const passedProposals = mockProposals.filter((p) => p.status === "passed")
  const rejectedProposals = mockProposals.filter((p) => p.status === "rejected")

  const getFilteredProposals = () => {
    switch (activeTab) {
      case "active":
        return activeProposals
      case "passed":
        return passedProposals
      case "rejected":
        return rejectedProposals
      default:
        return mockProposals
    }
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
              <Link href="/search" className="text-muted-foreground hover:text-foreground transition-colors">
                Search Flights
              </Link>
              <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                Dashboard
              </Link>
              <Badge variant="secondary" className="px-3 py-1">
                <Shield className="h-4 w-4 mr-2 text-primary" />
                Governance
              </Badge>
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
            <h1 className="font-serif font-bold text-3xl text-foreground mb-2">DAO Governance</h1>
            <p className="text-muted-foreground">
              Vote on proposals, delegate your power, and shape the future of Traqora
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/governance/delegate">
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Manage Delegation
              </Button>
            </Link>
            <Link href="/governance/history">
              <Button variant="outline">
                <History className="h-4 w-4 mr-2" />
                Voting History
              </Button>
            </Link>
            <Link href="/governance/create">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Proposal
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
                  <p className="text-sm text-muted-foreground">Active Proposals</p>
                  <p className="text-2xl font-bold">{activeProposals.length}</p>
                </div>
                <Vote className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Proposals</p>
                  <p className="text-2xl font-bold">{mockProposals.length}</p>
                </div>
                <Shield className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Your Voting Power</p>
                  <p className="text-2xl font-bold">{mockVotingPower.totalVotingPower.toLocaleString()}</p>
                </div>
                <Zap className="h-8 w-8 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Passed Proposals</p>
                  <p className="text-2xl font-bold">{passedProposals.length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList>
                <TabsTrigger value="all">All ({mockProposals.length})</TabsTrigger>
                <TabsTrigger value="active">Active ({activeProposals.length})</TabsTrigger>
                <TabsTrigger value="passed">Passed ({passedProposals.length})</TabsTrigger>
                <TabsTrigger value="rejected">Rejected ({rejectedProposals.length})</TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="space-y-4">
                {getFilteredProposals().length > 0 ? (
                  getFilteredProposals().map((proposal) => (
                    <ProposalCard key={proposal.id} proposal={proposal} />
                  ))
                ) : (
                  <Card>
                    <CardContent className="p-12 text-center">
                      <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No proposals found</p>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <VotingPowerCard
              baseBalance={mockVotingPower.baseBalance}
              delegatedToUser={mockVotingPower.delegatedToUser}
              delegatedAway={mockVotingPower.delegatedAway}
              totalVotingPower={mockVotingPower.totalVotingPower}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-serif">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/governance/delegate">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Delegation
                  </Button>
                </Link>
                <Link href="/governance/history">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <History className="h-4 w-4 mr-2" />
                    My Voting History
                  </Button>
                </Link>
                <Link href="/governance/create">
                  <Button variant="outline" className="w-full justify-start" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Proposal
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
