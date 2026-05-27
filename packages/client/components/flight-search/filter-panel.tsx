"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Filter, X, Clock, DollarSign, Plane, MapPin } from "lucide-react"

export interface FilterOptions {
  priceRange: [number, number]
  airlines: string[]
  stops: number[]
  departureWindow: string[]
  maxDuration: number
  sortBy: "price" | "duration" | "departure_time" | "rating"
  sortOrder: "asc" | "desc"
}

interface FilterPanelProps {
  filters: FilterOptions
  onFiltersChange: (filters: FilterOptions) => void
  onClearFilters: () => void
  isOpen: boolean
  onToggle: () => void
  availableAirlines?: string[]
  priceRange?: [number, number]
  maxDurationLimit?: number
}

const airlineNames: Record<string, string> = {
  "AA": "American Airlines",
  "DL": "Delta Air Lines",
  "UA": "United Airlines",
  "B6": "JetBlue Airways",
  "WN": "Southwest Airlines",
  "AS": "Alaska Airlines",
  "F9": "Frontier Airlines",
  "NK": "Spirit Airlines",
}

const departureWindows = [
  { value: "early", label: "Early Morning (6AM - 12PM)", range: "06:00-12:00" },
  { value: "afternoon", label: "Afternoon (12PM - 6PM)", range: "12:00-18:00" },
  { value: "evening", label: "Evening (6PM - 12AM)", range: "18:00-24:00" },
  { value: "night", label: "Night (12AM - 6AM)", range: "00:00-06:00" },
]

export function FilterPanel({
  filters,
  onFiltersChange,
  onClearFilters,
  isOpen,
  onToggle,
  availableAirlines = ["AA", "DL", "UA", "B6", "WN"],
  priceRange = [50, 1000],
  maxDurationLimit = 720, // 12 hours in minutes
}: FilterPanelProps) {
  const [localFilters, setLocalFilters] = useState<FilterOptions>(filters)

  const updateFilter = <K extends keyof FilterOptions>(
    key: K,
    value: FilterOptions[K]
  ) => {
    const newFilters = { ...localFilters, [key]: value }
    setLocalFilters(newFilters)
    onFiltersChange(newFilters)
  }

  const toggleAirline = (airline: string) => {
    const newAirlines = localFilters.airlines.includes(airline)
      ? localFilters.airlines.filter(a => a !== airline)
      : [...localFilters.airlines, airline]
    updateFilter("airlines", newAirlines)
  }

  const toggleStops = (stops: number) => {
    const newStops = localFilters.stops.includes(stops)
      ? localFilters.stops.filter(s => s !== stops)
      : [...localFilters.stops, stops]
    updateFilter("stops", newStops)
  }

  const toggleDepartureWindow = (window: string) => {
    const newWindows = localFilters.departureWindow.includes(window)
      ? localFilters.departureWindow.filter(w => w !== window)
      : [...localFilters.departureWindow, window]
    updateFilter("departureWindow", newWindows)
  }

  const formatPrice = (price: number) => {
    return `$${price}`
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getActiveFiltersCount = () => {
    let count = 0
    if (localFilters.priceRange[0] > priceRange[0] || localFilters.priceRange[1] < priceRange[1]) count++
    if (localFilters.airlines.length > 0) count++
    if (localFilters.stops.length > 0) count++
    if (localFilters.departureWindow.length > 0) count++
    if (localFilters.maxDuration < maxDurationLimit) count++
    return count
  }

  const handleClearFilters = () => {
    const defaultFilters: FilterOptions = {
      priceRange,
      airlines: [],
      stops: [],
      departureWindow: [],
      maxDuration: maxDurationLimit,
      sortBy: "price",
      sortOrder: "asc",
    }
    setLocalFilters(defaultFilters)
    onClearFilters()
  }

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        onClick={onToggle}
        className="fixed top-20 left-4 z-40 shadow-lg"
      >
        <Filter className="h-4 w-4 mr-2" />
        Filters
        {getActiveFiltersCount() > 0 && (
          <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 text-xs">
            {getActiveFiltersCount()}
          </Badge>
        )}
      </Button>
    )
  }

  return (
    <Card className="w-80 h-fit sticky top-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filters
            {getActiveFiltersCount() > 0 && (
              <Badge variant="secondary" className="ml-2">
                {getActiveFiltersCount()}
              </Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={onToggle}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {getActiveFiltersCount() > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearFilters}>
            Clear All
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sort Options */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Sort By</Label>
          <div className="flex gap-2">
            <Select
              value={localFilters.sortBy}
              onValueChange={(value: FilterOptions["sortBy"]) => updateFilter("sortBy", value)}
            >
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price">Price</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
                <SelectItem value="departure_time">Departure Time</SelectItem>
                <SelectItem value="rating">Rating</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={localFilters.sortOrder}
              onValueChange={(value: FilterOptions["sortOrder"]) => updateFilter("sortOrder", value)}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">↑</SelectItem>
                <SelectItem value="desc">↓</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator />

        {/* Price Range */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center">
            <DollarSign className="h-4 w-4 mr-1" />
            Price Range
          </Label>
          <div className="px-2">
            <Slider
              value={localFilters.priceRange}
              onValueChange={(value) => updateFilter("priceRange", value as [number, number])}
              max={priceRange[1]}
              min={priceRange[0]}
              step={10}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>{formatPrice(localFilters.priceRange[0])}</span>
              <span>{formatPrice(localFilters.priceRange[1])}</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Airlines */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center">
            <Plane className="h-4 w-4 mr-1" />
            Airlines
          </Label>
          <div className="space-y-2">
            {availableAirlines.map((airline) => (
              <div key={airline} className="flex items-center space-x-2">
                <Checkbox
                  id={`airline-${airline}`}
                  checked={localFilters.airlines.includes(airline)}
                  onCheckedChange={() => toggleAirline(airline)}
                />
                <Label
                  htmlFor={`airline-${airline}`}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {airlineNames[airline] || airline}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Stops */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center">
            <MapPin className="h-4 w-4 mr-1" />
            Stops
          </Label>
          <div className="space-y-2">
            {[0, 1, 2].map((stops) => (
              <div key={stops} className="flex items-center space-x-2">
                <Checkbox
                  id={`stops-${stops}`}
                  checked={localFilters.stops.includes(stops)}
                  onCheckedChange={() => toggleStops(stops)}
                />
                <Label
                  htmlFor={`stops-${stops}`}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {stops === 0 ? "Non-stop" : `${stops} stop${stops > 1 ? "s" : ""}`}
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Departure Time */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Departure Time
          </Label>
          <div className="space-y-2">
            {departureWindows.map((window) => (
              <div key={window.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`departure-${window.value}`}
                  checked={localFilters.departureWindow.includes(window.value)}
                  onCheckedChange={() => toggleDepartureWindow(window.value)}
                />
                <Label
                  htmlFor={`departure-${window.value}`}
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  <div>{window.label.split(" (")[0]}</div>
                  <div className="text-xs text-muted-foreground">{window.range}</div>
                </Label>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Max Duration */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Max Duration
          </Label>
          <div className="px-2">
            <Slider
              value={[localFilters.maxDuration]}
              onValueChange={(value) => updateFilter("maxDuration", value[0])}
              max={maxDurationLimit}
              min={60}
              step={30}
              className="w-full"
            />
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>1h</span>
              <span className="font-medium">{formatDuration(localFilters.maxDuration)}</span>
              <span>{formatDuration(maxDurationLimit)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}