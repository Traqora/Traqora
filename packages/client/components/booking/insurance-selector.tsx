"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Shield, HeartPulse, Luggage, CalendarX, Check, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { getInsuranceQuotes, InsuranceCoverageType, InsurancePremiumQuote } from "@/lib/api"

interface InsuranceSelectorProps {
  tripCostCents: number
  destination: string
  selectedCoverage: InsuranceCoverageType | null
  onSelectCoverage: (coverage: InsuranceCoverageType | null) => void
}

const tierLabels: Record<InsuranceCoverageType, string> = {
  basic: "Basic",
  standard: "Standard",
  premium: "Premium",
}

const tierDescriptions: Record<InsuranceCoverageType, string> = {
  basic: "Essential protection for unexpected medical costs",
  standard: "Balanced coverage for most travelers",
  premium: "Maximum coverage for peace of mind",
}

export function InsuranceSelector({
  tripCostCents,
  destination,
  selectedCoverage,
  onSelectCoverage,
}: InsuranceSelectorProps) {
  const [quotes, setQuotes] = useState<InsurancePremiumQuote[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!destination || tripCostCents <= 0) return
    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    getInsuranceQuotes(tripCostCents, destination)
      .then((data) => {
        if (!cancelled) setQuotes(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || "Failed to load insurance quotes")
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [tripCostCents, destination])

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-xl font-bold">Travel Insurance</h3>
        <Badge variant="outline" className="text-xs">Optional</Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Protect your trip against medical emergencies, lost baggage, and unexpected cancellations.
        Premiums are refundable in full within 24 hours of purchase.
      </p>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      )}

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      {!isLoading && !loadError && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quotes.map((quote) => {
            const isSelected = selectedCoverage === quote.coverageType
            return (
              <Card
                key={quote.coverageType}
                className={cn(
                  "cursor-pointer transition-all border-2",
                  isSelected ? "border-primary shadow-lg" : "border-transparent hover:border-border",
                )}
                onClick={() => onSelectCoverage(isSelected ? null : quote.coverageType)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{tierLabels[quote.coverageType]}</CardTitle>
                    {isSelected && <Check className="h-5 w-5 text-primary" />}
                  </div>
                  <CardDescription className="text-xs">{tierDescriptions[quote.coverageType]}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-bold">{formatCents(quote.premiumCents)}</div>
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <HeartPulse className="h-3.5 w-3.5" />
                      Medical: {formatCents(quote.coverageDetails.medicalCents)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Luggage className="h-3.5 w-3.5" />
                      Baggage: {formatCents(quote.coverageDetails.baggageCents)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CalendarX className="h-3.5 w-3.5" />
                      Cancellation: {formatCents(quote.coverageDetails.tripCancellationCents)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onSelectCoverage(null)}
        className={cn("text-muted-foreground", !selectedCoverage && "text-primary")}
      >
        <X className="h-4 w-4 mr-1" />
        Continue without insurance
      </Button>
    </div>
  )
}
