"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { SearchForm, SearchFormData } from "@/components/flight-search/search-form"
import { ResultsList } from "@/components/flight-search/results-list"
import { FilterPanel, FilterOptions } from "@/components/flight-search/filter-panel"
import { useFlightSearch } from "@/hooks/use-flight-search"
import { Flight } from "@/components/flight-search/flight-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plane, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { FlightSearchParams } from "@/lib/api"

function SearchContent() {
  const searchParams = useSearchParams()
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterOptions>({
    priceRange: [50, 1000],
    airlines: [],
    stops: [],
    departureWindow: [],
    maxDuration: 720,
    sortBy: "price",
    sortOrder: "asc",
  })

  // Parse search params
  const initialSearchData: SearchFormData = {
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
    departure: searchParams.get("departure") || "",
    return: searchParams.get("return") || undefined,
    passengers: searchParams.get("passengers") || "1",
    class: (searchParams.get("class") as SearchFormData["class"]) || "economy",
  }

  const { flights, isLoading, error, searchFlights } = useFlightSearch()

  // Perform initial search
  useEffect(() => {
    if (initialSearchData.from && initialSearchData.to && initialSearchData.departure) {
      searchFlights({
        from: initialSearchData.from,
        to: initialSearchData.to,
        date: initialSearchData.departure,
        passengers: parseInt(initialSearchData.passengers),
        class: initialSearchData.class,
      })
    }
  }, [])

  const handleSearch = (searchData: SearchFormData) => {
    searchFlights({
      from: searchData.from,
      to: searchData.to,
      date: searchData.departure,
      passengers: parseInt(searchData.passengers),
      class: searchData.class,
    })
  }

  const handleLoadMore = () => {
    // Implement pagination if needed
    console.log("Load more flights")
  }

  const handleSortChange = (sortBy: string, sortOrder: string) => {
    setFilters(prev => ({ ...prev, sortBy, sortOrder as "asc" | "desc" }))
    // Re-trigger search with new sort
    if (initialSearchData.from && initialSearchData.to && initialSearchData.departure) {
      searchFlights({
        from: initialSearchData.from,
        to: initialSearchData.to,
        date: initialSearchData.departure,
        passengers: parseInt(initialSearchData.passengers),
        class: initialSearchData.class,
        sort: sortBy as FlightSearchParams["sort"],
        sort_order: sortOrder as "asc" | "desc",
      })
    }
  }

  const handleFiltersChange = (newFilters: FilterOptions) => {
    setFilters(newFilters)
    // Apply filters and re-search
    if (initialSearchData.from && initialSearchData.to && initialSearchData.departure) {
      searchFlights({
        from: initialSearchData.from,
        to: initialSearchData.to,
        date: initialSearchData.departure,
        passengers: parseInt(initialSearchData.passengers),
        class: initialSearchData.class,
        price_min: newFilters.priceRange[0],
        price_max: newFilters.priceRange[1],
        airlines: newFilters.airlines,
        stops: newFilters.stops[0], // Simplified
        duration_max: newFilters.maxDuration,
        sort: newFilters.sortBy,
        sort_order: newFilters.sortOrder,
      })
    }
  }

  const handleClearFilters = () => {
    const defaultFilters: FilterOptions = {
      priceRange: [50, 1000],
      airlines: [],
      stops: [],
      departureWindow: [],
      maxDuration: 720,
      sortBy: "price",
      sortOrder: "asc",
    }
    setFilters(defaultFilters)
    handleFiltersChange(defaultFilters)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
              <div className="flex items-center space-x-2">
                <Plane className="h-6 w-6 text-primary" />
                <span className="font-serif font-bold text-xl text-foreground">Traqora</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth">
                <Button>Sign In</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Form */}
        <div className="mb-8">
          <SearchForm
            onSearch={handleSearch}
            isLoading={isLoading}
            initialValues={initialSearchData}
          />
        </div>

        {/* Main Content */}
        <div className="flex gap-6">
          {/* Filters */}
          <div className="hidden lg:block w-80 flex-shrink-0">
            <FilterPanel
              filters={filters}
              onFiltersChange={handleFiltersChange}
              onClearFilters={handleClearFilters}
              isOpen={true}
              onToggle={() => setShowFilters(!showFilters)}
            />
          </div>

          {/* Mobile Filter Toggle */}
          <div className="lg:hidden fixed bottom-4 right-4 z-40">
            <Button
              onClick={() => setShowFilters(!showFilters)}
              size="lg"
              className="shadow-lg"
            >
              Filters
            </Button>
          </div>

          {/* Mobile Filter Panel */}
          {showFilters && (
            <div className="lg:hidden fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
              <div className="fixed inset-y-0 left-0 w-80 bg-background shadow-xl">
                <FilterPanel
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  onClearFilters={handleClearFilters}
                  isOpen={true}
                  onToggle={() => setShowFilters(false)}
                />
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1">
            <ResultsList
              flights={flights}
              isLoading={isLoading}
              error={error}
              hasMore={false}
              onLoadMore={handleLoadMore}
              isLoadingMore={false}
              totalResults={flights.length}
              searchQuery={`${initialSearchData.from} → ${initialSearchData.to}`}
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
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <SearchContent />
    </Suspense>
  )
}
