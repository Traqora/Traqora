"use client";

import { useCallback, useEffect, useState } from "react";
import { useOffline } from "@/components/offline-provider";
import {
  cacheBooking,
  getCachedBookings,
  addPendingSync,
} from "@/lib/offline-storage";

export interface DatePriceData {
  date: string;
  minPrice: number;
  maxPrice: number;
  averagePrice: number;
  flightCount: number;
  priceLevel: "budget" | "moderate" | "expensive";
}

export interface PriceHeatmapData {
  dateRange: {
    startDate: string;
    endDate: string;
  };
  priceData: DatePriceData[];
  globalStats: {
    minPrice: number;
    maxPrice: number;
    averagePrice: number;
  };
  priceThresholds: {
    budget: { min: number; max: number };
    moderate: { min: number; max: number };
    expensive: { min: number; max: number };
  };
}

export interface PriceTrendData {
  startDate: string;
  endDate: string;
  trendData: Array<{
    date: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
    trend: "up" | "down" | "stable";
    percentageChange: number;
  }>;
}

export interface FlexibleDateSearchOptions {
  from: string;
  to: string;
  startDate: string;
  endDate: string;
  passengers: number;
  travelClass: "economy" | "premium_economy" | "business" | "first";
  priceMin?: number;
  priceMax?: number;
  airlines?: string[];
  stops?: number;
  durationMax?: number;
}

/**
 * Hook to fetch flexible date search data with caching
 */
export function useFlexibleDateSearch(options: FlexibleDateSearchOptions) {
  const [heatmapData, setHeatmapData] = useState<PriceHeatmapData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { isOnline } = useOffline();

  const fetchHeatmapData = useCallback(async () => {
    if (!options.from || !options.to) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        from: options.from,
        to: options.to,
        startDate: options.startDate,
        endDate: options.endDate,
        passengers: String(options.passengers),
        travelClass: options.travelClass,
        ...(options.priceMin && { priceMin: String(options.priceMin) }),
        ...(options.priceMax && { priceMax: String(options.priceMax) }),
        ...(options.airlines && { airlines: options.airlines.join(",") }),
        ...(options.stops !== undefined && { stops: String(options.stops) }),
        ...(options.durationMax && {
          durationMax: String(options.durationMax),
        }),
      });

      const response = await fetch(
        `/api/flights/flexible-search?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch heatmap data: ${response.statusText}`);
      }

      const data = await response.json();
      setHeatmapData(data.heatmapData);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);

      // If offline, try to use cached data
      if (!isOnline) {
        console.log("Offline: Using cached booking data as fallback");
        // Could implement fallback logic here
      }
    } finally {
      setIsLoading(false);
    }
  }, [options, isOnline]);

  useEffect(() => {
    fetchHeatmapData();
  }, [fetchHeatmapData]);

  return { heatmapData, isLoading, error, refetch: fetchHeatmapData };
}

/**
 * Hook to fetch price trends
 */
export function usePriceTrends(options: FlexibleDateSearchOptions) {
  const [trendData, setTrendData] = useState<PriceTrendData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchTrends = useCallback(async () => {
    if (!options.from || !options.to) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        from: options.from,
        to: options.to,
        startDate: options.startDate,
        endDate: options.endDate,
        passengers: String(options.passengers),
        travelClass: options.travelClass,
        ...(options.priceMin && { priceMin: String(options.priceMin) }),
        ...(options.priceMax && { priceMax: String(options.priceMax) }),
        ...(options.airlines && { airlines: options.airlines.join(",") }),
        ...(options.stops !== undefined && { stops: String(options.stops) }),
        ...(options.durationMax && {
          durationMax: String(options.durationMax),
        }),
      });

      const response = await fetch(
        `/api/flights/price-trends?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch trends: ${response.statusText}`);
      }

      const data = await response.json();
      setTrendData(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  return { trendData, isLoading, error, refetch: fetchTrends };
}

/**
 * Hook to get flights for a specific date with optional comparison
 */
export function useFlightsForDate(
  options: FlexibleDateSearchOptions & {
    date: string;
    compareWithDays?: number;
  },
) {
  const [flights, setFlights] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchFlights = useCallback(async () => {
    if (!options.from || !options.to || !options.date) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams({
        from: options.from,
        to: options.to,
        date: options.date,
        passengers: String(options.passengers),
        travelClass: options.travelClass,
        ...(options.compareWithDays && {
          compareWithDays: String(options.compareWithDays),
        }),
      });

      const response = await fetch(
        `/api/flights/flexible-search/date?${queryParams.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch flights: ${response.statusText}`);
      }

      const data = await response.json();
      setFlights(data);

      // Cache flights for offline access
      if (data.mainDate?.flights) {
        data.mainDate.flights.forEach((flight: any) => {
          cacheBooking({
            id: flight.id,
            flightNumber: flight.flight_number || flight.id,
            departureTime: flight.departure_time,
            arrivalTime: new Date(
              new Date(flight.departure_time).getTime() +
                flight.duration * 60000,
            ).toISOString(),
            airline: flight.airline,
            from: flight.from,
            to: flight.to,
            passengers: options.passengers,
            totalPrice: flight.pricing.usd,
            bookingDate: new Date().toISOString().split("T")[0],
            status: "pending",
          });
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  useEffect(() => {
    fetchFlights();
  }, [fetchFlights]);

  return { flights, isLoading, error, refetch: fetchFlights };
}

/**
 * Hook to track price alerts for specific routes and dates
 */
export function usePriceAlerts(options: FlexibleDateSearchOptions) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const setPriceAlert = useCallback(
    async (date: string, targetPrice: number) => {
      try {
        const response = await fetch("/api/flights/price-alerts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: options.from,
            to: options.to,
            date,
            targetPrice,
            notificationType: "email",
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to set price alert");
        }

        // Add to local state
        setAlerts((prev) => [
          ...prev,
          { date, targetPrice, createdAt: new Date() },
        ]);

        return response.json();
      } catch (error) {
        console.error("Failed to set price alert:", error);
        throw error;
      }
    },
    [options],
  );

  const removePriceAlert = useCallback(async (alertId: string) => {
    try {
      const response = await fetch(`/api/flights/price-alerts/${alertId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove price alert");
      }

      setAlerts((prev) => prev.filter((_, i) => i !== parseInt(alertId)));
    } catch (error) {
      console.error("Failed to remove price alert:", error);
      throw error;
    }
  }, []);

  return { alerts, isLoading, setPriceAlert, removePriceAlert };
}
