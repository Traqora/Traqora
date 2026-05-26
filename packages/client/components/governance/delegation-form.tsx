"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ArrowRight, Loader2, Trash2, UserPlus } from "lucide-react"

interface DelegationData {
  delegator: string
  delegate: string
  amount: number
  timestamp: string
}

interface DelegationFormProps {
  currentDelegations: DelegationData[]
  maxDelegatable: number
  onDelegate: (delegate: string, amount: number) => void
  onRevoke: (delegator: string) => void
}

export function DelegationForm({
  currentDelegations,
  maxDelegatable,
  onDelegate,
  onRevoke,
}: DelegationFormProps) {
  const [delegateAddress, setDelegateAddress] = useState("")
  const [amount, setAmount] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleDelegate = async () => {
    if (!delegateAddress || !amount) return

    setIsSubmitting(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))

    onDelegate(delegateAddress, parseInt(amount))
    setIsSubmitting(false)
    setDelegateAddress("")
    setAmount("")
    setDialogOpen(false)
  }

  const totalDelegated = currentDelegations.reduce((sum, d) => sum + d.amount, 0)
  const remaining = maxDelegatable - totalDelegated

  return (
    <div className="space-y-6">
      {/* Delegate Button */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full">
            <UserPlus className="h-4 w-4 mr-2" />
            Delegate Voting Power
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Delegate Voting Power</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="text-muted-foreground">
                Available to delegate: <span className="font-semibold text-foreground">{remaining.toLocaleString()} TRQ</span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="delegate-address">Delegate Address</Label>
              <Input
                id="delegate-address"
                placeholder="G..."
                value={delegateAddress}
                onChange={(e) => setDelegateAddress(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="delegate-amount">Amount (TRQ)</Label>
              <Input
                id="delegate-amount"
                type="number"
                placeholder="0"
                min="1"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              This will require signing with your Freighter wallet.
            </p>

            <Button
              className="w-full"
              disabled={!delegateAddress || !amount || parseInt(amount) > remaining || isSubmitting}
              onClick={handleDelegate}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing Transaction...
                </>
              ) : (
                "Confirm Delegation"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Active Delegations */}
      {currentDelegations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Delegations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {currentDelegations.map((delegation, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-mono truncate">{delegation.delegate}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(delegation.timestamp).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary">{delegation.amount.toLocaleString()} TRQ</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                    onClick={() => onRevoke(delegation.delegator)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <p className="text-sm">No active delegations</p>
            <p className="text-xs mt-1">Delegate your voting power to a trusted representative</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
