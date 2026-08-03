"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { CheckCircle, AlertCircle, PlaneTakeoff } from "lucide-react"
import { toast } from "sonner"
import { apiClient, CheckInRecord, CheckInWindow } from "@/lib/api"
import { BoardingPassCard } from "@/components/booking/boarding-pass-card"

export default function CheckInPage() {
  const params = useParams<{ bookingId: string }>()
  const bookingId = params.bookingId

  const [window_, setWindowInfo] = useState<CheckInWindow | null>(null)
  const [checkIn, setCheckIn] = useState<CheckInRecord | null>(null)
  const [seatNumber, setSeatNumber] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    const [windowRes, checkInRes] = await Promise.all([
      apiClient.getCheckInWindow(bookingId),
      apiClient.getCheckIn(bookingId),
    ])

    if (windowRes.success) {
      setWindowInfo(windowRes.data)
    }
    if (checkInRes.success) {
      setCheckIn(checkInRes.data)
      setSeatNumber(checkInRes.data.seatNumber || "")
    }
    setIsLoading(false)
  }, [bookingId])

  useEffect(() => {
    load()
  }, [load])

  const handleCheckIn = async () => {
    setIsSubmitting(true)
    setError(null)
    const response = await apiClient.checkIn(bookingId, seatNumber || undefined)
    if (response.success) {
      setCheckIn(response.data)
      toast.success("Checked in successfully")
    } else {
      setError(response.error?.message || "Check-in failed")
    }
    setIsSubmitting(false)
  }

  const handleSeatUpdate = async () => {
    if (!seatNumber) return
    setIsSubmitting(true)
    const response = await apiClient.reselectSeat(bookingId, seatNumber)
    if (response.success) {
      setCheckIn(response.data)
      toast.success("Seat updated")
    } else {
      toast.error(response.error?.message || "Failed to update seat")
    }
    setIsSubmitting(false)
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <div>
        <h1 className="font-serif font-bold text-3xl mb-2 flex items-center gap-2">
          <PlaneTakeoff className="h-7 w-7 text-primary" />
          Online Check-In
        </h1>
        <p className="text-muted-foreground">Booking ID: {bookingId}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {checkIn?.status === "checked_in" ? (
        <BoardingPassCard bookingId={bookingId} checkIn={checkIn} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Check In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {window_ && !window_.isOpen && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {new Date() < new Date(window_.opensAt)
                    ? `Check-in opens at ${new Date(window_.opensAt).toLocaleString()}`
                    : "Check-in window has closed for this flight."}
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Seat Number (optional)</label>
              <Input
                value={seatNumber}
                onChange={(e) => setSeatNumber(e.target.value)}
                placeholder="e.g. 14A"
                maxLength={8}
              />
            </div>

            <Button
              className="w-full"
              disabled={isSubmitting || (window_ ? !window_.isOpen : false)}
              onClick={handleCheckIn}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              {isSubmitting ? "Checking in..." : "Check In"}
            </Button>
          </CardContent>
        </Card>
      )}

      {checkIn?.status === "checked_in" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Change Seat</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              value={seatNumber}
              onChange={(e) => setSeatNumber(e.target.value)}
              placeholder="e.g. 14A"
              maxLength={8}
            />
            <Button variant="outline" disabled={isSubmitting} onClick={handleSeatUpdate}>
              Update
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
