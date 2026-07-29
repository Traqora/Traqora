"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FlexibleDateSearch } from "@/components/flexible-date-search";
import {
  useFlexibleDateSearch,
  usePriceTrends,
  useFlightsForDate,
  FlexibleDateSearchOptions,
} from "@/lib/use-flexible-date-search";
import { TrendingUp, Calendar } from "lucide-react";

interface FlexibleDateSearchPanelProps {
  from?: string;
  to?: string;
  passengers?: number;
  travelClass?: "economy" | "premium_economy" | "business" | "first";
  onDateSelect: (date: string) => void;
}

export function FlexibleDateSearchPanel({
  from = "JFK",
  to = "LAX",
  passengers = 1,
  travelClass = "economy",
  onDateSelect,
}: FlexibleDateSearchPanelProps) {
  const [startDate, setStartDate] = useState<string>(() => {
    const date = new Date();
    return date.toISOString().split("T")[0];
  });

  const [endDate, setEndDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split("T")[0];
  });

  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [priceMin, setPriceMin] = useState<number | undefined>();
  const [priceMax, setPriceMax] = useState<number | undefined>();

  const searchOptions: FlexibleDateSearchOptions = useMemo(
    () => ({
      from,
      to,
      startDate,
      endDate,
      passengers,
      travelClass,
      priceMin,
      priceMax,
    }),
    [from, to, startDate, endDate, passengers, travelClass, priceMin, priceMax],
  );

  // Fetch heatmap data
  const { heatmapData, isLoading: isHeatmapLoading } =
    useFlexibleDateSearch(searchOptions);

  // Fetch price trends
  const { trendData, isLoading: isTrendsLoading } =
    usePriceTrends(searchOptions);

  // Fetch flights for selected date
  const flightsResult = useFlightsForDate(
    selectedDate
      ? {
          ...searchOptions,
          date: selectedDate,
          compareWithDays: 2,
        }
      : {
          ...searchOptions,
          date: new Date().toISOString().split("T")[0],
          compareWithDays: 0,
        },
  );

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    onDateSelect(date);
  };

  const handleDateRangeChange = (newStartDate: string, newEndDate: string) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };

  return (
    <div className="w-full space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Price Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor="price-min"
                className="text-sm font-medium mb-2 block"
              >
                Minimum Price ($)
              </Label>
              <Input
                id="price-min"
                type="number"
                placeholder="100"
                value={priceMin || ""}
                onChange={(e) =>
                  setPriceMin(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                min="0"
              />
            </div>
            <div>
              <Label
                htmlFor="price-max"
                className="text-sm font-medium mb-2 block"
              >
                Maximum Price ($)
              </Label>
              <Input
                id="price-max"
                type="number"
                placeholder="1000"
                value={priceMax || ""}
                onChange={(e) =>
                  setPriceMax(
                    e.target.value ? Number(e.target.value) : undefined,
                  )
                }
                min="0"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Trends
          </TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="space-y-4">
          <FlexibleDateSearch
            onDateSelect={handleDateSelect}
            onDateRangeChange={handleDateRangeChange}
            heatmapData={heatmapData}
            isLoading={isHeatmapLoading}
            selectedDate={selectedDate}
          />
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Price Trends</CardTitle>
            </CardHeader>
            <CardContent>
              {isTrendsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : trendData?.trendData ? (
                <div className="space-y-4">
                  <div className="grid gap-2 max-h-96 overflow-auto">
                    {trendData.trendData.map((trend) => (
                      <div
                        key={trend.date}
                        className="p-3 border rounded-lg hover:bg-muted transition"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">
                              {new Date(trend.date).toLocaleDateString(
                                "en-US",
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                },
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              ${trend.avgPrice.toFixed(0)} ($
                              {trend.minPrice.toFixed(0)} -${" "}
                              {trend.maxPrice.toFixed(0)})
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                trend.trend === "down"
                                  ? "text-green-600"
                                  : trend.trend === "up"
                                    ? "text-red-600"
                                    : "text-yellow-600"
                              }`}
                            >
                              {trend.trend === "down"
                                ? "↓"
                                : trend.trend === "up"
                                  ? "↑"
                                  : "→"}{" "}
                              {Math.abs(trend.percentageChange).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No trend data available</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedDate
                  ? `Flights for ${new Date(selectedDate).toLocaleDateString()}`
                  : "Select a date to view flight details"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDate ? (
                flightsResult.isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : flightsResult.error ? (
                  <p className="text-red-600">
                    Error loading flights: {flightsResult.error.message}
                  </p>
                ) : flightsResult.flights?.mainDate?.flights ? (
                  <div className="space-y-3 max-h-96 overflow-auto">
                    {flightsResult.flights.mainDate.flights
                      .slice(0, 5)
                      .map((flight: any) => (
                        <div
                          key={flight.id}
                          className="p-3 border rounded-lg hover:bg-muted transition"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{flight.airline}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(
                                  flight.departure_time,
                                ).toLocaleTimeString("en-US", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}{" "}
                                - {flight.duration} min
                              </p>
                            </div>
                            <p className="text-lg font-bold">
                              ${flight.pricing.usd.toFixed(0)}
                            </p>
                          </div>
                        </div>
                      ))}
                    <p className="text-xs text-muted-foreground text-center mt-4">
                      Showing 5 of{" "}
                      {flightsResult.flights.mainDate.flights.length} flights
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No flights available for this date
                  </p>
                )
              ) : (
                <p className="text-muted-foreground">
                  Select a date from the calendar to view available flights
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
