"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle,
  QrCode,
  Download,
  ExternalLink,
  Shield,
  Leaf,
  FileText,
} from "lucide-react"
import { getTransactionReceiptPdf, type InsurancePolicy } from "@/lib/api"
import { getStellarExpertUrl } from "@/lib/wallet"
import { toast } from "sonner"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export interface BookingConfirmationProps {
  /** Booking reference shown to the traveler (falls back to a generated id). */
  bookingId: string
  /** Backend booking record, when available (used for receipt + explorer links). */
  booking?: {
    id?: string
    sorobanTxHash?: string | null
  } | null
  passengerName: string
  seatNumber?: string | null
  departureDate: string
  departureTime: string
  destinationCity: string
  terminal?: string | null
  gate?: string | null
  insurancePolicy?: InsurancePolicy | null
  offsetCertificate?: any
  onGoToDashboard: () => void
  onFileClaim?: (policyId: string) => void
}

/**
 * Post-payment booking confirmation ("success") view.
 *
 * Keeps the booking reference, real traveler details and working receipt /
 * explorer actions in one testable component.
 */
export function BookingConfirmation({
  bookingId,
  booking,
  passengerName,
  seatNumber,
  departureDate,
  departureTime,
  destinationCity,
  terminal,
  gate,
  insurancePolicy,
  offsetCertificate,
  onGoToDashboard,
  onFileClaim,
}: BookingConfirmationProps) {
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false)

  const receiptBookingId = booking?.id || bookingId
  const txHash = booking?.sorobanTxHash || null
  const terminalLabel =
    terminal || gate
      ? [terminal, gate].filter(Boolean).join(", ")
      : "Assigned at check-in"

  const handleDownloadReceipt = async () => {
    setIsDownloadingReceipt(true)
    try {
      const blob = await getTransactionReceiptPdf(receiptBookingId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `receipt-${receiptBookingId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error: any) {
      toast.error("Failed to download receipt", {
        description: error?.message || "Please try again",
      })
    } finally {
      setIsDownloadingReceipt(false)
    }
  }

  const handleViewExplorer = () => {
    if (!txHash) {
      toast.info("On-chain receipt is not available yet", {
        description: "We'll link the transaction once it is recorded on-chain.",
      })
      return
    }
    window.open(getStellarExpertUrl(txHash, "testnet"), "_blank", "noopener,noreferrer")
  }

  return (
    <div className="space-y-8 animate-in zoom-in duration-500">
      <div className="text-center space-y-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-3xl font-bold font-serif">Booking Confirmed!</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Your flight to {destinationCity} is all set. We&apos;ve sent a confirmation to your email and secured your ticket on the blockchain.
        </p>
      </div>

      <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-2xl">
        <div className="bg-primary p-6 text-primary-foreground flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-widest opacity-80">Booking Reference</p>
            <p className="text-2xl font-mono font-bold">{bookingId}</p>
          </div>
          <QrCode className="h-12 w-12" />
        </div>
        <div className="p-8">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Passenger</p>
              <p className="font-medium">{passengerName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Seat</p>
              <p className="font-medium">{seatNumber || "Assigned at check-in"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Departure</p>
              <p className="font-medium">{departureDate} at {departureTime}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase font-bold">Terminal</p>
              <p className="font-medium">{terminalLabel}</p>
            </div>
          </div>
          <Separator className="my-6" />
          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDownloadReceipt}
              disabled={isDownloadingReceipt}
            >
              <Download className="mr-2 h-4 w-4" />
              {isDownloadingReceipt ? "Preparing..." : "Receipt"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleViewExplorer}
              title={txHash ? "View transaction on Stellar Expert" : "On-chain receipt not available yet"}
            >
              <ExternalLink className="mr-2 h-4 w-4" /> Explorer
            </Button>
          </div>
        </div>
      </div>

      {insurancePolicy && (
        <div className="bg-card rounded-2xl border border-border p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold">Travel Insurance</span>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Insured &middot; {insurancePolicy.coverageType}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Policy {insurancePolicy.providerPolicyRef} is active. Premium is fully refundable until{" "}
            {new Date(insurancePolicy.refundEligibleUntil).toLocaleString()}.
          </p>
          <div className="flex gap-3">
            <a
              href={`${API_BASE}/api/v1/insurance/policy/${insurancePolicy.id}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" /> Download Policy PDF
              </Button>
            </a>
            {onFileClaim && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFileClaim(insurancePolicy.id)}
              >
                File a Claim
              </Button>
            )}
          </div>
        </div>
      )}

      {offsetCertificate && (
        <div className="bg-card rounded-2xl border border-green-200 p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Leaf className="h-5 w-5 text-green-600" />
              <span className="font-bold">Carbon Offset</span>
            </div>
            <Badge variant="secondary" className="bg-green-100 text-green-800">
              Carbon Neutral
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            This flight has been offset through {offsetCertificate.projectName}.
            {offsetCertificate.co2Kg} kg CO₂ offset &middot; Certificate: {offsetCertificate.certificateRef}
          </p>
          <a
            href={`${API_BASE}/api/v1/carbon/certificate/${offsetCertificate.purchaseId}`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="outline" size="sm">
              <FileText className="mr-2 h-4 w-4" /> Download Certificate
            </Button>
          </a>
        </div>
      )}

      <Button className="w-full h-12" variant="secondary" onClick={onGoToDashboard}>
        Go to Dashboard
      </Button>
    </div>
  )
}
