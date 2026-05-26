"use client"

import { useState, useCallback, useEffect } from "react"
import { apiClient, Flight, SearchFlightsRequest } from "@/lib/api"
import { useSocket } from "@/hooks/use-socket"
import { toast } from "sonner"

export function useFlightSearch() {
  const [flights, setFlights] = useState<Flight[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { socket, isConnected } = useSocket()

  const searchFlights = useCallback(async (params: SearchFlightsRequest) => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await apiClient.searchFlights(params)
      if (response.success && response.data) {
        setFlights(response.data)
      } else {
        setError(response.error?.message || "Failed to fetch flights")
        toast.error("Search Failed", { description: response.error?.message })
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred")
      toast.error("Error", { description: "An unexpected error occurred" })
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Real-time price updates via WebSocket
  useEffect(() => {
    if (!socket || !isConnected) return

    const handlePriceUpdate = (data: { flightId: string; newPrice: string }) => {
      setFlights((prevFlights) =>
        prevFlights.map((flight) =>
          flight.id === data.flightId
            ? { ...flight, price: data.newPrice }
            : flight
        )
      )
      
      // Notify user if price changed significantly for a flight they are looking at
      // (This could be more sophisticated)
      console.log(`Price updated for flight ${data.flightId}: ${data.newPrice}`)
    }

    socket.on("flight_price_update", handlePriceUpdate)

    return () => {
      socket.off("flight_price_update", handlePriceUpdate)
    }
  }, [socket, isConnected])

  return {
    flights,
    isLoading,
    error,
    searchFlights,
    isConnected
  }
}
