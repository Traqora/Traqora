import { FlightSearchService } from "./flightSearchService";
import {
  EnrichedFlight,
  FlightSearchCriteria,
  CabinClass,
} from "../types/flight";
import { measureAsync } from "./metrics";

export interface DatePriceData {
  date: string;
  minPrice: number;
  maxPrice: number;
  averagePrice: number;
  flightCount: number;
  priceLevel: "budget" | "moderate" | "expensive"; // for heatmap coloring
}

export interface FlexibleDateSearchCriteria {
  from: string;
  to: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  passengers: number;
  travelClass: CabinClass;
  priceMin?: number;
  priceMax?: number;
  airlines?: string[];
  stops?: number;
  durationMax?: number;
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

export interface FlexibleDateSearchResult {
  heatmapData: PriceHeatmapData;
  recommendedDates: DatePriceData[];
  lowestPriceDate: DatePriceData;
}

export class FlexibleDateSearchService {
  constructor(private readonly flightSearchService: FlightSearchService) {}

  /**
   * Search prices across a date range and return heatmap data
   */
  async searchFlexibleDates(
    criteria: FlexibleDateSearchCriteria,
  ): Promise<FlexibleDateSearchResult> {
    return measureAsync("flexible_search", "search_flexible_dates", () =>
      this._searchFlexibleDates(criteria),
    );
  }

  private async _searchFlexibleDates(
    criteria: FlexibleDateSearchCriteria,
  ): Promise<FlexibleDateSearchResult> {
    // Validate date range
    const startDate = new Date(criteria.startDate);
    const endDate = new Date(criteria.endDate);

    if (startDate > endDate) {
      throw new Error("Start date must be before end date");
    }

    const daysDifference = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysDifference > 90) {
      throw new Error("Date range cannot exceed 90 days");
    }

    // Generate all dates in range
    const dates = this._generateDateRange(criteria.startDate, criteria.endDate);

    // Search prices for each date
    const priceDataPromises = dates.map((date) =>
      this._searchSingleDate(criteria, date),
    );

    const priceDataResults = await Promise.allSettled(priceDataPromises);

    // Process results
    const priceData: DatePriceData[] = [];
    for (let i = 0; i < priceDataResults.length; i++) {
      const result = priceDataResults[i];
      if (result.status === "fulfilled") {
        priceData.push(result.value);
      } else {
        // Create empty entry for failed date searches
        priceData.push({
          date: dates[i],
          minPrice: 0,
          maxPrice: 0,
          averagePrice: 0,
          flightCount: 0,
          priceLevel: "moderate",
        });
      }
    }

    // Calculate global statistics
    const validPrices = priceData
      .filter((d) => d.flightCount > 0)
      .flatMap((d) => [d.minPrice, d.maxPrice]);

    const globalStats = {
      minPrice: Math.min(...validPrices, Number.MAX_VALUE),
      maxPrice: Math.max(...validPrices, 0),
      averagePrice:
        priceData.reduce((sum, d) => sum + d.averagePrice, 0) /
        priceData.length,
    };

    // Calculate price thresholds for heatmap
    const priceThresholds = this._calculatePriceThresholds(
      globalStats,
      priceData,
    );

    // Assign price levels based on thresholds
    priceData.forEach((data) => {
      if (data.flightCount === 0) {
        data.priceLevel = "moderate";
      } else if (data.averagePrice <= priceThresholds.budget.max) {
        data.priceLevel = "budget";
      } else if (data.averagePrice <= priceThresholds.moderate.max) {
        data.priceLevel = "moderate";
      } else {
        data.priceLevel = "expensive";
      }
    });

    // Find recommended dates (lowest prices and less busy)
    const recommendedDates = this._findRecommendedDates(priceData);

    // Find lowest price date
    const lowestPriceDate = priceData.reduce((lowest, current) => {
      if (current.flightCount === 0) return lowest;
      return current.averagePrice < lowest.averagePrice ? current : lowest;
    });

    return {
      heatmapData: {
        dateRange: {
          startDate: criteria.startDate,
          endDate: criteria.endDate,
        },
        priceData,
        globalStats,
        priceThresholds,
      },
      recommendedDates,
      lowestPriceDate,
    };
  }

  /**
   * Search flights for a single date
   */
  private async _searchSingleDate(
    criteria: FlexibleDateSearchCriteria,
    date: string,
  ): Promise<DatePriceData> {
    const searchCriteria: FlightSearchCriteria = {
      from: criteria.from,
      to: criteria.to,
      date,
      passengers: criteria.passengers,
      travelClass: criteria.travelClass,
      priceMin: criteria.priceMin,
      priceMax: criteria.priceMax,
      airlines: criteria.airlines,
      stops: criteria.stops,
      durationMax: criteria.durationMax,
      sortBy: "price",
      pageSize: 100, // Get more flights to calculate accurate average
    };

    try {
      const result =
        await this.flightSearchService.searchFlights(searchCriteria);

      if (result.data.length === 0) {
        return {
          date,
          minPrice: 0,
          maxPrice: 0,
          averagePrice: 0,
          flightCount: 0,
          priceLevel: "moderate",
        };
      }

      const prices = result.data.map((flight) => flight.pricing.usd);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const averagePrice =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;

      return {
        date,
        minPrice,
        maxPrice,
        averagePrice,
        flightCount: result.data.length,
        priceLevel: "moderate", // Will be set later
      };
    } catch (error) {
      console.error(`Failed to search flights for date ${date}:`, error);
      throw error;
    }
  }

  /**
   * Get detailed flights for a specific date and optionally compare with nearby dates
   */
  async getFlightsForDate(
    criteria: FlexibleDateSearchCriteria,
    date: string,
    compareWithDays?: number,
  ): Promise<{
    mainDate: { date: string; flights: EnrichedFlight[] };
    comparableDates?: { date: string; flights: EnrichedFlight[] }[];
  }> {
    return measureAsync("flexible_search", "get_flights_for_date", () =>
      this._getFlightsForDate(criteria, date, compareWithDays),
    );
  }

  private async _getFlightsForDate(
    criteria: FlexibleDateSearchCriteria,
    date: string,
    compareWithDays: number = 0,
  ): Promise<{
    mainDate: { date: string; flights: EnrichedFlight[] };
    comparableDates?: { date: string; flights: EnrichedFlight[] }[];
  }> {
    const searchCriteria: FlightSearchCriteria = {
      from: criteria.from,
      to: criteria.to,
      date,
      passengers: criteria.passengers,
      travelClass: criteria.travelClass,
      priceMin: criteria.priceMin,
      priceMax: criteria.priceMax,
      airlines: criteria.airlines,
      stops: criteria.stops,
      durationMax: criteria.durationMax,
      sortBy: "price",
      pageSize: 50,
    };

    const mainDateResult =
      await this.flightSearchService.searchFlights(searchCriteria);

    const result = {
      mainDate: { date, flights: mainDateResult.data },
      comparableDates: undefined as any,
    };

    // Get comparison dates if requested
    if (compareWithDays > 0) {
      const comparableDates: { date: string; flights: EnrichedFlight[] }[] = [];
      const baseDate = new Date(date);

      for (let i = -compareWithDays; i <= compareWithDays; i++) {
        if (i === 0) continue;

        const compareDate = new Date(baseDate);
        compareDate.setDate(compareDate.getDate() + i);
        const compareDateStr = compareDate.toISOString().split("T")[0];

        try {
          const compareSearchCriteria: FlightSearchCriteria = {
            ...searchCriteria,
            date: compareDateStr,
          };

          const compareResult = await this.flightSearchService.searchFlights(
            compareSearchCriteria,
          );

          comparableDates.push({
            date: compareDateStr,
            flights: compareResult.data,
          });
        } catch (error) {
          console.warn(
            `Failed to fetch flights for comparison date ${compareDateStr}:`,
            error,
          );
        }
      }

      result.comparableDates = comparableDates;
    }

    return result;
  }

  /**
   * Get price trends for a route over time
   */
  async getPriceTrends(criteria: FlexibleDateSearchCriteria): Promise<{
    startDate: string;
    endDate: string;
    trendData: Array<{
      date: string;
      avgPrice: number;
      minPrice: number;
      maxPrice: number;
      trend: "up" | "down" | "stable";
      percentageChange: number; // From previous day
    }>;
  }> {
    return measureAsync("flexible_search", "get_price_trends", () =>
      this._getPriceTrends(criteria),
    );
  }

  private async _getPriceTrends(criteria: FlexibleDateSearchCriteria): Promise<{
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
  }> {
    const result = await this._searchFlexibleDates(criteria);
    const priceData = result.heatmapData.priceData;

    const trendData = priceData
      .filter((d) => d.flightCount > 0)
      .map((data, index) => {
        let percentageChange = 0;

        if (index > 0) {
          const prevData = priceData[index - 1];
          if (prevData.flightCount > 0) {
            percentageChange =
              ((data.averagePrice - prevData.averagePrice) /
                prevData.averagePrice) *
              100;
          }
        }

        const trend =
          percentageChange > 2
            ? "up"
            : percentageChange < -2
              ? "down"
              : "stable";

        return {
          date: data.date,
          avgPrice: data.averagePrice,
          minPrice: data.minPrice,
          maxPrice: data.maxPrice,
          trend,
          percentageChange,
        };
      });

    return {
      startDate: criteria.startDate,
      endDate: criteria.endDate,
      trendData,
    };
  }

  /**
   * Generate array of dates between start and end
   */
  private _generateDateRange(
    startDateStr: string,
    endDateStr: string,
  ): string[] {
    const dates: string[] = [];
    const currentDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    while (currentDate <= endDate) {
      dates.push(currentDate.toISOString().split("T")[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
  }

  /**
   * Calculate price thresholds for heatmap coloring
   */
  private _calculatePriceThresholds(
    stats: { minPrice: number; maxPrice: number; averagePrice: number },
    priceData: DatePriceData[],
  ): {
    budget: { min: number; max: number };
    moderate: { min: number; max: number };
    expensive: { min: number; max: number };
  } {
    // Use percentile-based thresholds
    const validPrices = priceData
      .filter((d) => d.averagePrice > 0)
      .map((d) => d.averagePrice)
      .sort((a, b) => a - b);

    if (validPrices.length === 0) {
      return {
        budget: { min: 0, max: 100 },
        moderate: { min: 100, max: 200 },
        expensive: { min: 200, max: 1000 },
      };
    }

    const p33 = validPrices[Math.floor(validPrices.length * 0.33)];
    const p66 = validPrices[Math.floor(validPrices.length * 0.66)];

    return {
      budget: { min: 0, max: p33 },
      moderate: { min: p33, max: p66 },
      expensive: { min: p66, max: stats.maxPrice * 1.1 },
    };
  }

  /**
   * Find recommended dates based on price and availability
   */
  private _findRecommendedDates(priceData: DatePriceData[]): DatePriceData[] {
    // Filter out dates with no flights
    const validDates = priceData.filter((d) => d.flightCount > 0);

    if (validDates.length === 0) {
      return [];
    }

    // Sort by average price
    const sortedByPrice = [...validDates].sort(
      (a, b) => a.averagePrice - b.averagePrice,
    );

    // Get top 5 cheapest or fewer if not enough data
    const topCheapest = sortedByPrice.slice(0, 5);

    // Sort by number of flights (less busy = more options)
    const sortedByAvailability = [...validDates].sort(
      (a, b) => b.flightCount - a.flightCount,
    );

    const topAvailable = sortedByAvailability.slice(0, 3);

    // Combine and deduplicate
    const recommendedSet = new Set([
      ...topCheapest.map((d) => d.date),
      ...topAvailable.map((d) => d.date),
    ]);

    return priceData.filter((d) => recommendedSet.has(d.date));
  }
}
