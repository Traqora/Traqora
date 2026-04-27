"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Armchair, Info } from "lucide-react"

interface Seat {
  id: string
  row: number
  label: string
  type: "economy" | "premium" | "business" | "first"
  status: "available" | "occupied" | "selected"
  price: number
}

interface SeatSelectorProps {
  onSeatSelect: (seat: Seat) => void
  selectedSeatId?: string
  cabinClass: string
}

export function SeatSelector({ onSeatSelect, selectedSeatId, cabinClass }: SeatSelectorProps) {
  // Mock seat layout
  const rows = 20
  const cols = ["A", "B", "C", "", "D", "E", "F"]
  
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedSeatId)

  const getSeatType = (row: number): Seat["type"] => {
    if (row <= 2) return "first"
    if (row <= 5) return "business"
    if (row <= 8) return "premium"
    return "economy"
  }

  const getSeatPrice = (type: Seat["type"]): number => {
    switch (type) {
      case "first": return 150
      case "business": return 80
      case "premium": return 40
      default: return 15
    }
  }

  const handleSeatClick = (seat: Seat) => {
    if (seat.status === "occupied") return
    setSelectedId(seat.id)
    onSeatSelect(seat)
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
          </div>

          {/* Seat Map */}
          <div className="relative bg-muted/30 p-8 rounded-3xl border border-border w-full max-w-md">
            {/* Plane Nose */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-muted/30 rounded-t-[100px] border-t border-x border-border -z-10" />
            
            <div className="grid gap-4">
              {/* Column Labels */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {cols.map((col, i) => (
                  <div key={i} className="text-center text-xs font-bold text-muted-foreground h-6 flex items-center justify-center">
                    {col}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {Array.from({ length: rows }).map((_, rowIndex) => {
                const rowNum = rowIndex + 1
                const type = getSeatType(rowNum)
                
                return (
                  <div key={rowIndex} className="grid grid-cols-7 gap-2 items-center">
                    {cols.map((col, colIndex) => {
                      if (col === "") {
                        return (
                          <div key={colIndex} className="text-center text-xs font-medium text-muted-foreground/40">
                            {rowNum}
                          </div>
                        )
                      }

                      const seatId = `${rowNum}${col}`
                      const isOccupied = Math.random() < 0.3 // Mock occupancy
                      const isSelected = selectedId === seatId
                      const isCompatible = type === cabinClass.toLowerCase() || (cabinClass === "economy" && type === "economy")

                      return (
                        <button
                          key={colIndex}
                          disabled={isOccupied || !isCompatible}
                          onClick={() => handleSeatClick({
                            id: seatId,
                            row: rowNum,
                            label: seatId,
                            type: type,
                            status: isOccupied ? "occupied" : isSelected ? "selected" : "available",
                            price: getSeatPrice(type)
                          })}
                          className={cn(
                            "w-full aspect-square rounded-md flex items-center justify-center transition-all duration-200",
                            isOccupied 
                              ? "bg-muted text-muted-foreground/30 cursor-not-allowed" 
                              : isSelected
                                ? "bg-primary text-primary-foreground shadow-lg scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background"
                                : isCompatible
                                  ? "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
                                  : "bg-muted/50 text-muted-foreground/20 cursor-not-allowed grayscale"
                          )}
                          title={isOccupied ? "Occupied" : isCompatible ? `Seat ${seatId} - $${getSeatPrice(type)}` : `Requires ${type} booking`}
                        >
                          <Armchair className={cn("h-4 w-4", isSelected ? "animate-pulse" : "")} />
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>

          {selectedId && (
            <div className="w-full bg-primary/5 p-4 rounded-xl border border-primary/10 animate-slide-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold">
                    {selectedId}
                  </div>
                  <div>
                    <p className="font-bold">Seat {selectedId}</p>
                    <p className="text-sm text-muted-foreground">{getSeatType(parseInt(selectedId))} Class</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-lg text-primary">+${getSeatPrice(getSeatType(parseInt(selectedId)))}</p>
                  <p className="text-xs text-muted-foreground">Added to fare</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 p-3 rounded-lg max-w-sm">
            <Info className="h-4 w-4 shrink-0 text-primary" />
            <p>Seat map availability is updated in real-time. Prices may vary based on seat location and amenities.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
