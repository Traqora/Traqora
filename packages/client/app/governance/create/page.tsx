"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plane,
  ArrowLeft,
  Shield,
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"
import { useGovernanceStore } from "@/lib/stores/governance"

export default function CreateProposalPage() {
  const router = useRouter()
  const store = useGovernanceStore()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [proposalType, setProposalType] = useState("")
  const [votingPeriodDays, setVotingPeriodDays] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState("")

  const isFormValid = title.trim() && description.trim() && proposalType && votingPeriodDays

  const handleSubmit = () => {
    if (!isFormValid) return
    setShowConfirmDialog(true)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    setError("")

    try {
      const proposalData = {
        proposer: 'current-user-address', // TODO: Get from wallet context
        title: title.trim(),
        description: description.trim(),
        proposalType,
        votingPeriodDays: parseInt(votingPeriodDays)
      }

      const newProposal = await store.createProposal(proposalData)

      if (newProposal) {
        setIsSuccess(true)
        setTimeout(() => {
          router.push(`/governance/${newProposal.id}`)
        }, 2000)
      } else {
        setError("Failed to create proposal. Please try again.")
      }
    } catch (err) {
      setError("An error occurred while creating the proposal.")
      console.error(err)
    } finally {
      setIsSubmitting(false)
      setShowConfirmDialog(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <Card>
            <CardContent className="p-12 text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="font-serif font-bold text-2xl text-foreground mb-2">
                Proposal Created Successfully!
              </h2>
              <p className="text-muted-foreground mb-6">
                Your proposal has been submitted to the DAO governance system.
                Redirecting to the proposal page...
              </p>
              <Button onClick={() => router.push('/governance')}>
                Back to Governance
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
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

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
            Create New Proposal
          </h1>
          <p className="text-muted-foreground">
            Submit a proposal for the Traqora DAO to vote on. Make sure your proposal is clear and well-reasoned.
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Proposal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Enter a clear, concise title for your proposal"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">
                {title.length}/200 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                placeholder="Provide a detailed explanation of your proposal, including the problem it solves and how it benefits the community"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">
                {description.length}/5000 characters
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="type">Proposal Type *</Label>
                <Select value={proposalType} onValueChange={setProposalType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select proposal type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Feature Request</SelectItem>
                    <SelectItem value="fee_change">Fee Change</SelectItem>
                    <SelectItem value="upgrade">System Upgrade</SelectItem>
                    <SelectItem value="treasury">Treasury Allocation</SelectItem>
                    <SelectItem value="governance">Governance Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="votingPeriod">Voting Period (Days) *</Label>
                <Select value={votingPeriodDays} onValueChange={setVotingPeriodDays}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select voting period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="21">21 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handleSubmit}
                disabled={!isFormValid}
                className="flex-1"
              >
                <Shield className="h-4 w-4 mr-2" />
                Create Proposal
              </Button>
              <Button variant="outline" onClick={() => router.push('/governance')}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Guidelines */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base font-serif">Proposal Guidelines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• Proposals should be clear and actionable</p>
            <p>• Include specific details about implementation</p>
            <p>• Consider the impact on all stakeholders</p>
            <p>• Respectful and constructive language only</p>
            <p>• Minimum quorum of 10,000 TRQ votes required</p>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Proposal Creation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Are you sure you want to create this proposal? Once submitted, it cannot be modified.
            </p>
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">{title}</h4>
              <p className="text-sm text-muted-foreground line-clamp-3">{description}</p>
              <div className="flex gap-4 mt-2 text-sm">
                <span>Type: {proposalType}</span>
                <span>Voting Period: {votingPeriodDays} days</span>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleConfirm} disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Confirm & Create
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Plane,
  ArrowLeft,
  Shield,
  FileText,
  Loader2,
  CheckCircle,
  AlertTriangle,
} from "lucide-react"

export default function CreateProposalPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [proposalType, setProposalType] = useState("")
  const [votingPeriodDays, setVotingPeriodDays] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const isFormValid = title.trim() && description.trim() && proposalType && votingPeriodDays

  const handleSubmit = () => {
    if (!isFormValid) return
    setShowConfirmDialog(true)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)

    // Simulate wallet signing and submission
    await new Promise((resolve) => setTimeout(resolve, 2000))

    setIsSubmitting(false)
    setIsSuccess(true)

    setTimeout(() => {
      setShowConfirmDialog(false)
      router.push("/governance")
    }, 2000)
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Create Proposal</h1>
          <p className="text-muted-foreground">
            Submit a new governance proposal for the Traqora community to vote on
          </p>
        </div>

        {/* Admin Notice */}
        <Card className="mb-6 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Admin Action Required</p>
              <p className="text-amber-700 dark:text-amber-300 mt-1">
                Creating a proposal requires a minimum of 10 TRQ tokens (proposal threshold). This action will be
                recorded on the Stellar blockchain.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="font-serif flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Proposal Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Proposal Title</Label>
              <Input
                id="title"
                placeholder="Enter a clear, concise title for your proposal"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">{title.length}/100 characters</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe your proposal in detail. Include the motivation, expected impact, and any relevant technical details."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={8}
              />
              <p className="text-xs text-muted-foreground">
                Be thorough — voters need enough context to make an informed decision
              </p>
            </div>

            {/* Proposal Type */}
            <div className="space-y-2">
              <Label>Proposal Type</Label>
              <Select value={proposalType} onValueChange={setProposalType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select proposal type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fee_change">Fee Change</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                  <SelectItem value="upgrade">Protocol Upgrade</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Voting Period */}
            <div className="space-y-2">
              <Label htmlFor="voting-period">Voting Period (days)</Label>
              <Input
                id="voting-period"
                type="number"
                placeholder="14"
                min="7"
                max="90"
                value={votingPeriodDays}
                onChange={(e) => setVotingPeriodDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Minimum 7 days. Recommended: 14 days for standard proposals, 30 days for major changes.
              </p>
            </div>

            {/* Preview */}
            {isFormValid && (
              <Card className="bg-muted">
                <CardHeader>
                  <CardTitle className="text-base">Preview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Title</span>
                    <span className="font-medium">{title}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-medium capitalize">{proposalType.replace("_", " ")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Voting Period</span>
                    <span className="font-medium">{votingPeriodDays} days</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Submit */}
            <Button className="w-full" size="lg" disabled={!isFormValid} onClick={handleSubmit}>
              <Shield className="h-4 w-4 mr-2" />
              Submit Proposal
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {isSuccess ? "Proposal Created!" : "Confirm Proposal Submission"}
            </DialogTitle>
          </DialogHeader>

          {isSuccess ? (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground text-center">
                Your proposal has been submitted to the Stellar blockchain. Redirecting to governance page...
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Title</span>
                  <span className="font-medium">{title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-medium capitalize">{proposalType.replace("_", " ")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Voting Period</span>
                  <span className="font-medium">{votingPeriodDays} days</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                This action will require signing with your Freighter wallet and cannot be undone.
              </p>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowConfirmDialog(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={handleConfirm} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    "Confirm & Sign"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
