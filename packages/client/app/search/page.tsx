"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SearchForm, SearchFormData } from "@/components/flight-search/search-form"
import { ResultsList } from "@/components/flight-search/results-list"
import { FilterPanel, FilterOptions } from "@/components/flight-search/filter-panel"
import { FlightCard, Flight } from "@/components/flight-search/flight-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plane, Search, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { saveRecentSearch } from "@/components/flight-search/recent-searches"

// Mock flight data for demonstration
const mockFlights: Flight[] = [
  {
    id: "FL001",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure_time: "2024-02-15T08:00:00",
    arrival_time: "2024-02-15T11:30:00",
    airline: "AA",
    airline_name: "American Airlines",
    stops: 0,
    duration: 330,
    price: 299,
    rating: 4.5,
    available_seats: 45,
    class: "economy",
    aircraft: "Boeing 737-800",
    amenities: ["WiFi", "Power Outlets", "In-flight Entertainment"]
  },
  {
    id: "FL002",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure_time: "2024-02-15T10:30:00",
    arrival_time: "2024-02-15T14:00:00",
    airline: "DL",
    airline_name: "Delta Air Lines",
    stops: 0,
    duration: 330,
    price: 325,
    rating: 4.7,
    available_seats: 28,
    class: "economy",
    aircraft: "Airbus A320",
    amenities: ["WiFi", "Power Outlets"]
  },
  {
    id: "FL003",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure_time: "2024-02-15T14:00:00",
    arrival_time: "2024-02-15T19:30:00",
    airline: "UA",
    airline_name: "United Airlines",
    stops: 1,
    duration: 390,
    price: 249,
    rating: 4.2,
    available_seats: 60,
    class: "economy",
    aircraft: "Boeing 737 MAX 8",
    amenities: ["WiFi"]
  },
  {
    id: "FL004",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure_time: "2024-02-15T16:30:00",
    arrival_time: "2024-02-15T20:00:00",
    airline: "B6",
    airline_name: "JetBlue Airways",
    stops: 0,
    duration: 330,
    price: 279,
    rating: 4.6,
    available_seats: 35,
    class: "premium_economy",
    aircraft: "Airbus A321neo",
    amenities: ["WiFi", "Power Outlets", "In-flight Entertainment", "Extra Legroom"]
  },
  {
    id: "FL005",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure_time: "2024-02-15T20:00:00",
    arrival_time: "2024-02-15T23:30:00",
    airline: "AA",
    airline_name: "American Airlines",
    stops: 0,
    duration: 330,
    price: 450,
    rating: 4.8,
    available_seats: 12,
    class: "business",
    aircraft: "Boeing 777-200",
    amenities: ["WiFi", "Power Outlets", "In-flight Entertainment", "Lie-flat Seats", "Premium Meals"]
  },
]

function SearchResultsContent() {
  const searchParams = useSearchParams()
  const [flights, setFlights] = useState<Flight[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filteredFlights, setFilteredFlights] = useState<Flight[]>([])

  const [filters, setFilters] = useState<FilterOptions>({
    priceRange: [50, 1000],
    airlines: [],
    stops: [],
    departureWindow: [],
    maxDuration: 720,
    sortBy: "price",
    sortOrder: "asc",
  })

  const [searchData, setSearchData] = useState<SearchFormData>({
    tripType: (searchParams.get("tripType") as any) || "roundtrip",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
    departure: searchParams.get("departure") || "",
    return: searchParams.get("return") || "",
    passengers: searchParams.get("passengers") || "1",
    class: (searchParams.get("class") as any) || "economy",
  })

  useEffect(() => {
    const loadFlights = async () => {
      setIsLoading(true)
      setError(null)

      try {
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000))

        // Filter mock flights based on search parameters
        let results = mockFlights.filter(flight => {
          if (searchData.from && flight.from !== searchData.from) return false
          if (searchData.to && flight.to !== searchData.to) return false
          if (searchData.class && flight.class !== searchData.class) return false
          return true
        })

        setFlights(results)
        setFilteredFlights(results)
      } catch (err) {
        setError("Failed to load flights. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    loadFlights()
  }, [searchData])

  useEffect(() => {
    let results = [...flights]

    // Apply filters
    if (filters.airlines.length > 0) {
      results = results.filter(f => filters.airlines.includes(f.airline))
    }

    if (filters.stops.length > 0) {
      results = results.filter(f => filters.stops.includes(f.stops))
    }

    if (filters.priceRange) {
      results = results.filter(f => f.price >= filters.priceRange[0] && f.price <= filters.priceRange[1])
    }

    if (filters.maxDuration < 720) {
      results = results.filter(f => f.duration <= filters.maxDuration)
    }

    if (filters.departureWindow.length > 0) {
      results = results.filter(f => {
        const hour = new Date(f.departure_time).getHours()
        return filters.departureWindow.some(window => {
          if (window === "early") return hour >= 6 && hour < 12
          if (window === "afternoon") return hour >= 12 && hour < 18
          if (window === "evening") return hour >= 18 && hour < 24
          if (window === "night") return hour >= 0 && hour < 6
          return false
        })
      })
    }

    // Apply sorting
    results.sort((a, b) => {
      let comparison = 0
      switch (filters.sortBy) {
        case "price":
          comparison = a.price - b.price
          break
        case "duration":
          comparison = a.duration - b.duration
          break
        case "departure_time":
          comparison = new Date(a.departure_time).getTime() - new Date(b.departure_time).getTime()
          break
        case "rating":
          comparison = a.rating - b.rating
          break
      }
      return filters.sortOrder === "asc" ? comparison : -comparison
    })

    setFilteredFlights(results)
  }, [filters, flights])

  const handleSearch = (data: SearchFormData) => {
    // Save to recent searches
    saveRecentSearch(data)
    setSearchData(data)
  }

  const handleFiltersChange = (newFilters: FilterOptions) => {
    setFilters(newFilters)
  }

  const handleClearFilters = () => {
    setFilters({
      priceRange: [50, 1000],
      airlines: [],
      stops: [],
      departureWindow: [],
      maxDuration: 720,
      sortBy: "price",
      sortOrder: "asc",
    })
  }

  const handleSortChange = (sortBy: string, sortOrder: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: sortBy as FilterOptions["sortBy"],
      sortOrder: sortOrder as FilterOptions["sortOrder"],
    }))
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Search Form */}
        <div className="mb-6 sm:mb-8">
          <SearchForm onSearch={handleSearch} initialValues={searchData} />
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Filter Panel Toggle Button */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <FilterPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
              isOpen={showFilters}
              onToggle={() => setShowFilters(!showFilters)}
              availableAirlines={["AA", "DL", "UA", "B6", "WN"]}
              priceRange={[50, 1000]}
              maxDurationLimit={720}
            />
          </div>

          {/* Results */}
          <div className="flex-1">
            <ResultsList
              flights={filteredFlights}
              isLoading={isLoading}
              error={error}
              hasMore={false}
              onLoadMore={() => {}}
              isLoadingMore={false}
              totalResults={filteredFlights.length}
              searchQuery={`${searchData.from} to ${searchData.to}`}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              onSortChange={handleSortChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchResultsContent />
    </Suspense>
  )
}
