"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ThumbsUp, ThumbsDown, Shield, Loader2 } from "lucide-react"

interface VoteDialogProps {
  proposalId: number
  proposalTitle: string
  votingPower: number
  onVote: (support: boolean) => void
  hasVoted: boolean
  disabled?: boolean
}

export function VoteDialog({
  proposalId,
  proposalTitle,
  votingPower,
  onVote,
  hasVoted,
  disabled = false,
}: VoteDialogProps) {
  const [open, setOpen] = useState(false)
  const [selectedVote, setSelectedVote] = useState<boolean | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isConfirmed, setIsConfirmed] = useState(false)

  const handleSubmit = async () => {
    if (selectedVote === null) return

    setIsSubmitting(true)

    // Simulate wallet signing delay
    await new Promise((resolve) => setTimeout(resolve, 1500))

    onVote(selectedVote)
    setIsSubmitting(false)
    setIsConfirmed(true)

    setTimeout(() => {
      setOpen(false)
      setIsConfirmed(false)
      setSelectedVote(null)
    }, 1500)
  }

  if (hasVoted) {
    return (
      <Button variant="outline" disabled className="w-full">
        <Shield className="h-4 w-4 mr-2" />
        Already Voted
      </Button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" disabled={disabled}>
          <Shield className="h-4 w-4 mr-2" />
          Cast Your Vote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif">Cast Your Vote</DialogTitle>
        </DialogHeader>

        {isConfirmed ? (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <Shield className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-semibold text-lg">Vote Submitted!</p>
            <p className="text-sm text-muted-foreground text-center">
              Your vote has been recorded on the Stellar blockchain.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Proposal Info */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Proposal #{proposalId}</p>
              <p className="font-medium mt-1">{proposalTitle}</p>
            </div>

            {/* Voting Power */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm text-muted-foreground">Your Voting Power</span>
              <Badge variant="secondary" className="text-sm">
                {votingPower.toLocaleString()} TRQ
              </Badge>
            </div>

            {/* Vote Options */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant={selectedVote === true ? "default" : "outline"}
                className={`h-20 flex flex-col gap-2 ${
                  selectedVote === true
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "hover:border-green-300 hover:text-green-600"
                }`}
                onClick={() => setSelectedVote(true)}
              >
                <ThumbsUp className="h-6 w-6" />
                <span>Vote Yes</span>
              </Button>
              <Button
                variant={selectedVote === false ? "default" : "outline"}
                className={`h-20 flex flex-col gap-2 ${
                  selectedVote === false
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "hover:border-red-300 hover:text-red-600"
                }`}
                onClick={() => setSelectedVote(false)}
              >
                <ThumbsDown className="h-6 w-6" />
                <span>Vote No</span>
              </Button>
            </div>

            {/* Signing Notice */}
            <p className="text-xs text-muted-foreground text-center">
              This action will require signing with your Freighter wallet.
            </p>

            {/* Submit */}
            <Button
              className="w-full"
              disabled={selectedVote === null || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing Transaction...
                </>
              ) : (
                "Confirm Vote"
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
