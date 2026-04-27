"use client"

import { useState, useCallback } from "react"
import { useBookingFlow, BookingStep } from "./use-booking-flow"
import { CreateBookingRequest, Booking } from "@/lib/api"

export function useBooking() {
  const [bookingState, bookingActions] = useBookingFlow()
  
  const [selectedSeat, setSelectedSeat] = useState<{ id: string, price: number } | null>(null)
  
  const selectSeat = useCallback((seatId: string, price: number) => {
    setSelectedSeat({ id: seatId, price })
  }, [])

  const startBooking = useCallback(async (flightId: string, passengerCount: number) => {
    // This would typically involve navigating to the booking page or setting the flight
    // For now, we'll assume the booking flow is already initialized with the flight
  }, [])

  return {
    ...bookingState,
    ...bookingActions,
    selectedSeat,
    selectSeat,
    // Add any additional booking-specific logic here
  }
}
