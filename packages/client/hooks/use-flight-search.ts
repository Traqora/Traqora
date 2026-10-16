"use client";

import { useState, useCallback, useEffect } from "react";
import { apiClient, Flight, SearchFlightsRequest } from "@/lib/api";
import { useSocket } from "@/hooks/use-socket";
import { toast } from "sonner";
import {
  cacheSearchResults,
  getCachedSearchResults,
  CachedSearchQuery,
} from "@/lib/offline-storage";

function toSearchQuery(params: SearchFlightsRequest): CachedSearchQuery {
  return {
    from: params.from,
    to: params.to,
    date: params.date,
    passengers: params.passengers,
    class: params.class,
  };
}

export function useFlightSearch() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const { manager, connected } = useSocket();

  const searchFlights = useCallback(async (params: SearchFlightsRequest) => {
    setIsLoading(true);
    setError(null);
    setIsFromCache(false);

    const query = toSearchQuery(params);

    const useCacheFallback = () => {
      const cached = getCachedSearchResults(query);
      if (cached) {
        setFlights(cached.flights);
        setIsFromCache(true);
        return true;
      }
      return false;
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      if (!useCacheFallback()) {
        setError("You're offline and no cached results are available for this search.");
      }
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.searchFlights(params);
      if (response.success && response.data) {
        setFlights(response.data);
        cacheSearchResults(query, response.data);
      } else if (!useCacheFallback()) {
        setError(response.error?.message || "Failed to fetch flights");
        toast.error("Search Failed", { description: response.error?.message });
      }
    } catch (err: any) {
      if (!useCacheFallback()) {
        setError(err.message || "An unexpected error occurred");
        toast.error("Error", { description: "An unexpected error occurred" });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Real-time price updates via WebSocket
  useEffect(() => {
    if (!manager || !connected) return;

    const handlePriceUpdate = (data: { flightId: string; newPrice: string }) => {
      setFlights((prevFlights) =>
        prevFlights.map((flight) =>
          flight.id === data.flightId
            ? { ...flight, price: data.newPrice }
            : flight
        )
      );
      
      console.log(`Price updated for flight ${data.flightId}: ${data.newPrice}`);
    };

    manager.on("flight_price_update", handlePriceUpdate);

    return () => {
      manager.off("flight_price_update", handlePriceUpdate);
    };
  }, [manager, connected]);

  return {
    flights,
    isLoading,
    error,
    searchFlights,
    isConnected: connected,
    isFromCache,
  };
}