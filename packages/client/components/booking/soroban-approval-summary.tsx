"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { WalletTransactionSummary } from "@/lib/wallet-transaction"
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react"

interface SorobanApprovalSummaryProps {
  summary: WalletTransactionSummary
  isProcessing?: boolean
  signingStatus?: "idle" | "pending" | "success" | "rejected" | "timeout" | "error"
  signatureRejected?: boolean
  canRetrySignature?: boolean
  error?: string | null
  onApprove: () => void
  onRetry?: () => void
  approveLabel?: string
}

const shortContractId = (contractId: string | null): string => {
  if (!contractId) return "Unknown"
  if (contractId.length <= 16) return contractId
  return `${contractId.slice(0, 8)}…${contractId.slice(-6)}`
}

export function SorobanApprovalSummary({
  summary,
  isProcessing = false,
  signingStatus = "idle",
  signatureRejected = false,
  canRetrySignature = false,
  error = null,
  onApprove,
  onRetry,
  approveLabel = "Approve in wallet",
}: SorobanApprovalSummaryProps) {
  const pending = isProcessing || signingStatus === "pending"
  const simulationFailed = summary.simulation.available && !summary.simulation.success
  const canApprove = !pending && !simulationFailed

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
          Review before wallet approval
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Contract action</dt>
            <dd className="font-mono font-medium">
              {summary.contractAction ?? "Unknown"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="font-mono font-medium" title={summary.contractId ?? undefined}>
              {shortContractId(summary.contractId)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Network</dt>
            <dd className="font-medium capitalize">{summary.network}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Estimated network fee</dt>
            <dd className="font-medium">
              {summary.estimatedFeeXlm} XLM
              <span className="ml-2 text-xs text-muted-foreground">
                ({summary.estimatedFeeStroops.toLocaleString()} stroops)
              </span>
            </dd>
          </div>
        </dl>

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Simulation</span>
          {!summary.simulation.available ? (
            <Badge variant="outline">
              <Clock3 className="mr-1 h-3 w-3" aria-hidden="true" />
              Not available
            </Badge>
          ) : summary.simulation.success ? (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
              Passed
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
              Failed
            </Badge>
          )}
          {summary.simulation.instructions !== null && (
            <Badge variant="outline">
              {summary.simulation.instructions.toLocaleString()} instructions
            </Badge>
          )}
          {summary.simulation.latestLedger !== null && (
            <Badge variant="outline">Ledger {summary.simulation.latestLedger}</Badge>
          )}
        </div>

        {summary.simulation.error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Simulation could not complete safely</AlertTitle>
            <AlertDescription>{summary.simulation.error}</AlertDescription>
          </Alert>
        )}

        {(signatureRejected || signingStatus === "rejected") && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Signature request rejected</AlertTitle>
            <AlertDescription>
              Your itinerary and booking inputs are still saved. Retry the
              signature below — you will not be charged for a second booking.
            </AlertDescription>
          </Alert>
        )}

        {signingStatus === "timeout" && (
          <Alert>
            <Clock3 className="h-4 w-4" />
            <AlertTitle>Wallet did not respond</AlertTitle>
            <AlertDescription>
              Your checkout is safe. Retry signing using the same booking.
            </AlertDescription>
          </Alert>
        )}

        {error && !signatureRejected && signingStatus !== "timeout" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to complete signing</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          {canRetrySignature && onRetry ? (
            <Button onClick={onRetry} disabled={pending} className="w-full sm:w-auto">
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {pending ? "Waiting for wallet..." : "Retry signature"}
            </Button>
          ) : (
            <Button onClick={onApprove} disabled={!canApprove} className="w-full sm:w-auto">
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {pending ? "Waiting for wallet..." : approveLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
