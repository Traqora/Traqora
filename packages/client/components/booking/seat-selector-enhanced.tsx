"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Armchair, Info, Lock } from "lucide-react";
import { handleKeyboardNavigation } from "@/lib/accessibility";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import {
  getSeatAvailability,
  lockSeat,
  unlockSeat,
  selectSeat,
} from "@/lib/api/services";

interface Seat {
  available: boolean;
  type: "economy" | "premium_economy" | "business" | "first";
  price: number;
  locked?: { until: Date; by: string };
}

interface SeatSelectorEnhancedProps {
  flightId: string;
  bookingId: string;
  cabinClass: string;
  displayCurrency?: CurrencyCode;
  rates?: Record<string, number>;
  onSeatSelect?: (seatNumber: string, price: number) => void;
}

export function SeatSelectorEnhanced({
  flightId,
  bookingId,
  cabinClass,
  displayCurrency = "USD",
  rates,
  onSeatSelect,
}: SeatSelectorEnhancedProps) {
  const [seatMap, setSeatMap] = useState<Record<number, Record<string, Seat>>>(
    {},
  );
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [lockedSeat, setLockedSeat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cols = ["A", "B", "C", "D", "E", "F"];
  const rows = 20;

  // Fetch seat availability
  useEffect(() => {
    const fetchSeats = async () => {
      try {
        setLoading(true);
        const availability = await getSeatAvailability(flightId, cabinClass);
        setSeatMap(availability.seatMap);
      } catch (err) {
        setError("Failed to load seat map");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSeats();
  }, [flightId, cabinClass]);

  const convertPrice = (priceInCents: number): number => {
    if (displayCurrency === "USD" || !rates) return priceInCents / 100;
    return (priceInCents / 100) * (rates[displayCurrency] || 1);
  };

  const handleSeatClick = useCallback(
    async (seatNumber: string, seat: Seat) => {
      if (!seat.available || seat.locked) return;

      try {
        // Lock seat temporarily (15 min)
        await lockSeat(flightId, seatNumber, bookingId);
        setLockedSeat(seatNumber);
        setSelectedSeat(seatNumber);

        // Confirm seat selection
        await selectSeat(bookingId, seatNumber);

        onSeatSelect?.(seatNumber, seat.price);

        // Auto-unlock after 15 minutes if not confirmed
        setTimeout(
          () => {
            if (lockedSeat === seatNumber) {
              unlockSeat(flightId, seatNumber, bookingId).catch(console.error);
            }
          },
          15 * 60 * 1000,
        );
      } catch (err) {
        setError("Failed to select seat");
        console.error(err);
        setSelectedSeat(null);
      }
    },
    [flightId, bookingId, lockedSeat, onSeatSelect],
  );

  const handleSeatKeyDown = (
    event: React.KeyboardEvent,
    seatNumber: string,
    seat: Seat,
  ): void => {
    handleKeyboardNavigation(event.nativeEvent, {
      onEnter: () => handleSeatClick(seatNumber, seat),
      onSpace: () => handleSeatClick(seatNumber, seat),
    });
  };

  if (loading) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-none shadow-none bg-transparent">
        <CardHeader className="px-0">
          <CardTitle>Loading Seat Map...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-2xl mx-auto border-none shadow-none bg-transparent">
        <CardHeader className="px-0">
          <CardTitle className="text-destructive">{error}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto border-none shadow-none bg-transparent">
      <CardHeader className="px-0">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Armchair className="h-5 w-5 text-primary" />
            <span>Select Your Seat</span>
          </div>
          <Badge variant="outline" className="font-normal">
            {cabinClass.charAt(0).toUpperCase() + cabinClass.slice(1)} Class
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0">
        <div className="flex flex-col items-center gap-8">
          {/* Legend */}
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary/10 border border-primary/20" />
              <span className="text-muted-foreground">Available</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center">
                <Armchair className="h-4 w-4" />
              </div>
              <span className="text-muted-foreground">Selected</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-muted border border-border" />
              <span className="text-muted-foreground">Occupied</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300 flex items-center justify-center">
                <Lock className="h-3 w-3 text-yellow-700" />
              </div>
              <span className="text-muted-foreground">Locked</span>
            </div>
          </div>

          {/* Seat Map */}
          <div className="relative bg-muted/30 p-8 rounded-3xl border border-border w-full max-w-md">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-muted/30 rounded-t-[100px] border-t border-x border-border -z-10" />

            <div
              role="grid"
              aria-label="Aircraft seat map"
              className="grid gap-4"
            >
              {/* Column Headers */}
              <div role="row" className="grid grid-cols-7 gap-2 mb-2">
                {cols.map((col, i) => (
                  <div
                    key={i}
                    role="columnheader"
                    className="text-center text-xs font-bold text-muted-foreground h-6 flex items-center justify-center"
                  >
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {Array.from({ length: rows }).map((_, rowIndex) => {
                const rowNum = rowIndex + 1;
                const isFirstCol = true;

                return (
                  <div
                    key={rowIndex}
                    role="row"
                    className="grid grid-cols-7 gap-2 items-center"
                  >
                    {cols.map((col, colIndex) => {
                      if (colIndex === 3) {
                        return (
                          <div
                            key={colIndex}
                            className="text-center text-xs font-medium text-muted-foreground/40"
                          >
                            {rowNum}
                          </div>
                        );
                      }

                      const seatNumber = `${rowNum}${col}`;
                      const seat = seatMap[rowNum]?.[col];

                      if (!seat) {
                        return (
                          <div
                            key={colIndex}
                            className="w-full aspect-square rounded-md bg-muted/50"
                          />
                        );
                      }

                      const isSelected = selectedSeat === seatNumber;
                      const isLocked =
                        seat.locked && seat.locked.by !== bookingId;
                      const isOccupied = !seat.available;

                      return (
                        <button
                          key={colIndex}
                          role="gridcell"
                          disabled={isOccupied || isLocked || !seat.available}
                          aria-label={`Seat ${seatNumber}, ${seat.type} class, ${
                            isOccupied
                              ? "occupied"
                              : isSelected
                                ? "selected"
                                : isLocked
                                  ? "locked"
                                  : `available, ${formatCurrency(convertPrice(seat.price), displayCurrency)}`
                          }`}
                          aria-selected={isSelected}
                          aria-disabled={isOccupied || isLocked}
                          onClick={() => handleSeatClick(seatNumber, seat)}
                          onKeyDown={(e) =>
                            handleSeatKeyDown(e, seatNumber, seat)
                          }
                          className={cn(
                            "w-full aspect-square rounded-md flex items-center justify-center transition-all duration-200",
                            isOccupied
                              ? "bg-muted text-muted-foreground/30 cursor-not-allowed"
                              : isLocked
                                ? "bg-yellow-100 text-yellow-700 cursor-not-allowed border border-yellow-300"
                                : isSelected
                                  ? "bg-primary text-primary-foreground shadow-lg scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background"
                                  : "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 cursor-pointer",
                          )}
                        >
                          {isLocked ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Armchair
                              className={cn(
                                "h-4 w-4",
                                isSelected ? "animate-pulse" : "",
                              )}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Seat Info */}
          {selectedSeat &&
            seatMap[parseInt(selectedSeat)]?.[
              selectedSeat[selectedSeat.length - 1]
            ] && (
              <div className="w-full bg-primary/5 p-4 rounded-xl border border-primary/10 animate-slide-up">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                      {selectedSeat}
                    </div>
                    <div>
                      <p className="font-bold">Seat {selectedSeat}</p>
                      <p className="text-sm text-muted-foreground">
                        {
                          seatMap[parseInt(selectedSeat)]?.[
                            selectedSeat[selectedSeat.length - 1]
                          ]?.type
                        }{" "}
                        Class
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg text-primary">
                      +
                      {formatCurrency(
                        convertPrice(
                          seatMap[parseInt(selectedSeat)]?.[
                            selectedSeat[selectedSeat.length - 1]
                          ]?.price || 0,
                        ),
                        displayCurrency,
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Added to fare
                    </p>
                  </div>
                </div>
              </div>
            )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 p-3 rounded-lg max-w-sm">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <p>
              Seat selection is real-time. Your seat is locked for 15 minutes
              while booking. Prices vary by location and cabin class.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
