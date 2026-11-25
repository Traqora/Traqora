"use client"

import { AlertCircle, ArrowLeft, Clock, Lock, RefreshCw, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { BOOKING_DETAIL_STATE_COPY, BookingDetailState } from "./booking-detail-state"

export interface BookingDetailStateViewProps {
  state: BookingDetailState
  /** Shows a skeleton instead of a state card while the lookup is in flight. */
  isLoading?: boolean
  /** Called by the "Try again" action for the unavailable state. */
  onRetry?: () => void
  /** Called by the "Back to bookings" action for missing and unauthorized states. */
  onBack?: () => void
}

function StateIcon({ state }: { state: BookingDetailState }) {
  const className = "h-5 w-5 shrink-0"
  switch (state) {
    case "missing":
      return <Search className={className} aria-hidden="true" />
    case "unauthorized":
      return <Lock className={className} aria-hidden="true" />
    case "pending":
      return <Clock className={className} aria-hidden="true" />
    default:
      return <AlertCircle className={className} aria-hidden="true" />
  }
}

/**
 * Presentational view for the booking detail states defined in
 * booking-detail-state.ts. It never receives or renders a raw error message.
 */
export function BookingDetailStateView({
  state,
  isLoading = false,
  onRetry,
  onBack,
}: BookingDetailStateViewProps) {
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" data-state="loading" className="w-full min-w-0 space-y-4">
        <Skeleton className="h-8 w-full max-w-56" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <span className="sr-only">Loading booking details</span>
      </div>
    )
  }

  if (state === "ready") return null

  const copy = BOOKING_DETAIL_STATE_COPY[state]
  const backAction = state === "missing" || state === "unauthorized"

  return (
    <Card
      role="status"
      aria-live="polite"
      data-state={state}
      className="w-full min-w-0 max-w-2xl mx-auto"
    >
      <CardHeader className="flex flex-col sm:flex-row items-start gap-3 min-w-0">
        <StateIcon state={state} />
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-xl font-serif break-words">{copy.title}</CardTitle>
          <CardDescription className="break-words">{copy.description}</CardDescription>
        </div>
      </CardHeader>
      {(onBack || onRetry) && copy.actionLabel && (
        <CardContent className="flex flex-wrap gap-2">
          {backAction && onBack ? (
            <Button variant="outline" onClick={onBack} className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              {copy.actionLabel}
            </Button>
          ) : null}
          {state === "unavailable" && onRetry ? (
            <Button variant="default" onClick={onRetry} className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {copy.actionLabel}
            </Button>
          ) : null}
        </CardContent>
      )}
    </Card>
  )
}
