"use client";

import { useState, useCallback, useMemo } from "react";
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
import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Zap,
} from "lucide-react";

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

interface FlexibleDateSearchProps {
  onDateSelect: (date: string) => void;
  onDateRangeChange?: (startDate: string, endDate: string) => void;
  heatmapData?: PriceHeatmapData;
  isLoading?: boolean;
  selectedDate?: string;
}

export function FlexibleDateSearch({
  onDateSelect,
  onDateRangeChange,
  heatmapData,
  isLoading = false,
  selectedDate,
}: FlexibleDateSearchProps) {
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState<string>(() => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split("T")[0];
  });
  const [viewMonth, setViewMonth] = useState<Date>(new Date());

  const handleStartDateChange = useCallback(
    (value: string) => {
      setStartDate(value);
      onDateRangeChange?.(value, endDate);
    },
    [endDate, onDateRangeChange],
  );

  const handleEndDateChange = useCallback(
    (value: string) => {
      setEndDate(value);
      onDateRangeChange?.(startDate, value);
    },
    [startDate, onDateRangeChange],
  );

  const handlePreviousMonth = () => {
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setViewMonth(
      new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
    );
  };

  const getPriceColor = useCallback(
    (priceLevel: DatePriceData["priceLevel"], flightCount: number) => {
      if (flightCount === 0) {
        return "bg-gray-100 text-gray-400 cursor-not-allowed";
      }

      switch (priceLevel) {
        case "budget":
          return "bg-green-100 hover:bg-green-200 text-green-900 cursor-pointer";
        case "moderate":
          return "bg-yellow-100 hover:bg-yellow-200 text-yellow-900 cursor-pointer";
        case "expensive":
          return "bg-red-100 hover:bg-red-200 text-red-900 cursor-pointer";
        default:
          return "bg-gray-100 text-gray-600";
      }
    },
    [],
  );

  const calendarDays = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  }, [viewMonth]);

  const getDateFromDay = (day: number): string => {
    const date = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day);
    return date.toISOString().split("T")[0];
  };

  const getDatePriceData = (day: number): DatePriceData | null => {
    if (!heatmapData) return null;

    const dateStr = getDateFromDay(day);
    return heatmapData.priceData.find((d) => d.date === dateStr) || null;
  };

  const isDateInRange = (day: number): boolean => {
    const dateStr = getDateFromDay(day);
    return dateStr >= startDate && dateStr <= endDate;
  };

  const isDateDisabled = (day: number): boolean => {
    const dateStr = getDateFromDay(day);
    const today = new Date().toISOString().split("T")[0];
    return dateStr < today;
  };

  const monthName = viewMonth.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="w-full space-y-6">
      {/* Date Range Picker */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Select Date Range
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label
                htmlFor="start-date"
                className="text-sm font-medium mb-2 block"
              >
                Start Date
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                max={endDate}
                className="w-full"
              />
            </div>
            <div>
              <Label
                htmlFor="end-date"
                className="text-sm font-medium mb-2 block"
              >
                End Date
              </Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                min={startDate}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar View with Price Heatmap */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Price Heatmap Calendar</CardTitle>
            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin">
                  <Zap className="w-4 h-4" />
                </div>
                Loading prices...
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!heatmapData && !isLoading && (
            <div className="flex items-center gap-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
              <p className="text-sm text-blue-800">
                Select a date range to view prices and recommendations
              </p>
            </div>
          )}

          {heatmapData && (
            <>
              {/* Price Legend */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-100 rounded border border-green-300" />
                  <span className="text-sm font-medium">Budget</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-yellow-100 rounded border border-yellow-300" />
                  <span className="text-sm font-medium">Moderate</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-100 rounded border border-red-300" />
                  <span className="text-sm font-medium">Expensive</span>
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-card border rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Lowest Price
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    ${heatmapData.globalStats.minPrice.toFixed(0)}
                  </p>
                </div>
                <div className="p-4 bg-card border rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Average Price
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    ${heatmapData.globalStats.averagePrice.toFixed(0)}
                  </p>
                </div>
                <div className="p-4 bg-card border rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Highest Price
                  </p>
                  <p className="text-2xl font-bold mt-1">
                    ${heatmapData.globalStats.maxPrice.toFixed(0)}
                  </p>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="space-y-4">
                {/* Month Navigation */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handlePreviousMonth}
                    className="p-2 hover:bg-muted rounded-lg transition"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h3 className="text-lg font-semibold">{monthName}</h3>
                  <button
                    onClick={handleNextMonth}
                    className="p-2 hover:bg-muted rounded-lg transition"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>

                {/* Day Headers */}
                <div className="grid grid-cols-7 gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day) => (
                      <div
                        key={day}
                        className="text-center text-sm font-semibold text-muted-foreground py-2"
                      >
                        {day}
                      </div>
                    ),
                  )}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day, index) => {
                    if (day === null) {
                      return (
                        <div key={`empty-${index}`} className="aspect-square" />
                      );
                    }

                    const dateStr = getDateFromDay(day);
                    const priceData = getDatePriceData(day);
                    const disabled = isDateDisabled(day);
                    const inRange = isDateInRange(day);
                    const isSelected = dateStr === selectedDate;

                    return (
                      <button
                        key={day}
                        onClick={() =>
                          !disabled && priceData && onDateSelect(dateStr)
                        }
                        disabled={
                          disabled || !priceData || priceData.flightCount === 0
                        }
                        className={`
                          aspect-square rounded-lg p-2 text-center text-sm font-medium
                          flex flex-col items-center justify-center
                          transition-all
                          ${
                            disabled
                              ? "opacity-50 cursor-not-allowed"
                              : getPriceColor(
                                  priceData?.priceLevel || "moderate",
                                  priceData?.flightCount || 0,
                                )
                          }
                          ${inRange ? "ring-2 ring-primary" : ""}
                          ${
                            isSelected
                              ? "ring-2 ring-primary bg-primary/10"
                              : ""
                          }
                        `}
                        title={
                          priceData
                            ? `${priceData.averagePrice ? "$" + priceData.averagePrice.toFixed(0) : "No flights"}`
                            : ""
                        }
                      >
                        <div className="text-lg">{day}</div>
                        {priceData && priceData.flightCount > 0 && (
                          <div className="text-xs opacity-75">
                            ${priceData.averagePrice.toFixed(0)}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recommended Dates - would be populated with recommendedDates from API */}
      {heatmapData && heatmapData.priceData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="w-5 h-5" />
              Budget-Friendly Dates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {heatmapData.priceData
                .filter(
                  (d) =>
                    d.priceLevel === "budget" &&
                    d.flightCount > 0 &&
                    d.date >= startDate &&
                    d.date <= endDate,
                )
                .slice(0, 6)
                .map((date) => (
                  <button
                    key={date.date}
                    onClick={() => onDateSelect(date.date)}
                    className="p-4 border rounded-lg hover:bg-accent transition text-left"
                  >
                    <p className="text-sm text-muted-foreground">
                      {new Date(date.date).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      ${date.averagePrice.toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {date.flightCount} flights available
                    </p>
                  </button>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
