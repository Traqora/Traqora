"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { MapPin, Calendar, Users, Search, ArrowUpDown } from "lucide-react"

interface SearchFormProps {
  onSearch: (params: any) => void
  isLoading?: boolean
}

export function EnhancedSearchForm({ onSearch, isLoading = false }: SearchFormProps) {
  const [searchParams, setSearchParams] = useState({
    from: "",
    to: "",
    departure: "",
    return: "",
    passengers: "1",
    class: "economy",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(searchParams)
  }

  const swapLocations = () => {
    setSearchParams((prev) => ({
      ...prev,
      from: prev.to,
      to: prev.from,
    }))
  }

  return (
    <Card className="shadow-lg">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
            <div className="space-y-2 relative">
              <Label htmlFor="from" className="text-sm font-medium">
                From
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="from"
                  placeholder="Departure city"
                  value={searchParams.from}
                  onChange={(e) => setSearchParams({ ...searchParams, from: e.target.value })}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="to" className="text-sm font-medium">
                To
              </Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="to"
                  placeholder="Destination city"
                  value={searchParams.to}
                  onChange={(e) => setSearchParams({ ...searchParams, to: e.target.value })}
                  className="pl-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute -right-12 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
                  onClick={swapLocations}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="departure" className="text-sm font-medium">
                Departure
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="departure"
                  type="date"
                  value={searchParams.departure}
                  onChange={(e) => setSearchParams({ ...searchParams, departure: e.target.value })}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="return" className="text-sm font-medium">
                Return (Optional)
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="return"
                  type="date"
                  value={searchParams.return}
                  onChange={(e) => setSearchParams({ ...searchParams, return: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="passengers" className="text-sm font-medium">
                Passengers
              </Label>
              <Select
                value={searchParams.passengers}
                onValueChange={(value) => setSearchParams({ ...searchParams, passengers: value })}
              >
                <SelectTrigger>
                  <Users className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Passenger</SelectItem>
                  <SelectItem value="2">2 Passengers</SelectItem>
                  <SelectItem value="3">3 Passengers</SelectItem>
                  <SelectItem value="4">4+ Passengers</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search Flights
                </>
              )}
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-4">
            <Select
              value={searchParams.class}
              onValueChange={(value) => setSearchParams({ ...searchParams, class: value })}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="economy">Economy</SelectItem>
                <SelectItem value="premium">Premium Economy</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="first">First Class</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
