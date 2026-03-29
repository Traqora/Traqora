"use client"

import { useState } from "react"
import { FlightCard, Flight } from "./flight-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { 
  Plane, 
  Search, 
  AlertCircle, 
  ChevronDown,
  SortAsc,
  Filter
} from "lucide-react"

interface ResultsListProps {
  flights: Flight[]
  isLoading: boolean
  error: string | null
  hasMore: boolean
  onLoadMore: () => void
  isLoadingMore: boolean
  totalResults?: number
  searchQuery?: string
  sortBy?: string
  sortOrder?: string
  onSortChange?: (sortBy: string, sortOrder: string) => void
}

export function ResultsList({
  flights,
  isLoading,
  error,
  hasMore,
  onLoadMore,
  isLoadingMore,
  totalResults,
  searchQuery,
  sortBy = "price",
  sortOrder = "asc",
  onSortChange,
}: ResultsListProps) {
  const [showSortOptions, setShowSortOptions] = useState(false)

  const sortOptions = [
    { value: "price", label: "Price", orders: ["asc", "desc"] },
    { value: "duration", label: "Duration", orders: ["asc", "desc"] },
    { value: "departure_time", label: "Departure Time", orders: ["asc", "desc"] },
    { value: "rating", label: "Rating", orders: ["desc", "asc"] },
  ]

  const getSortLabel = () => {
    const option = sortOptions.find(opt => opt.value === sortBy)
    const orderLabel = sortOrder === "asc" ? "↑" : "↓"
    return `${option?.label || "Price"} ${orderLabel}`
  }

  // Loading skeleton
  if (isLoading && flights.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="border-0 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex items-center gap-3 lg:w-48">
                  <Skeleton className="w-8 h-8 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="text-center space-y-1">
                      <Skeleton className="h-8 w-16 mx-auto" />
                      <Skeleton className="h-4 w-12 mx-auto" />
                    </div>
                    <div className="flex-1 px-4 space-y-1">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-20 mx-auto" />
                    </div>
                    <div className="text-center space-y-1">
                      <Skeleton className="h-8 w-16 mx-auto" />
                      <Skeleton className="h-4 w-12 mx-auto" />
                    </div>
                  </div>
                </div>
                <div className="lg:w-32 space-y-2">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-4 w-16 mx-auto" />
                </div>
                <div className="lg:w-40 space-y-2">
                  <Skeleton className="h-8 w-20 ml-auto" />
                  <Skeleton className="h-4 w-16 ml-auto" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="p-6 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Search Error</h3>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (!isLoading && flights.length === 0) {
    return (
      <Card className="border-0 bg-card/50 backdrop-blur-sm">
        <CardContent className="p-12 text-center">
          <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">No flights found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery 
              ? `No flights match your search criteria for "${searchQuery}"`
              : "Try adjusting your search criteria or filters"
            }
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="outline">
              <Filter className="h-4 w-4 mr-2" />
              Clear Filters
            </Button>
            <Button variant="outline">
              <Search className="h-4 w-4 mr-2" />
              New Search
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Results Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Plane className="h-5 w-5 text-primary" />
          <span className="font-medium">
            {totalResults !== undefined ? (
              <>
                {totalResults.toLocaleString()} flight{totalResults !== 1 ? "s" : ""} found
              </>
            ) : (
              <>
                {flights.length} flight{flights.length !== 1 ? "s" : ""}
                {hasMore && " (showing first results)"}
              </>
            )}
          </span>
          {searchQuery && (
            <Badge variant="secondary" className="ml-2">
              {searchQuery}
            </Badge>
          )}
        </div>

        {/* Sort Controls */}
        {onSortChange && (
          <div className="relative">
            <Button
              variant="outline"
              onClick={() => setShowSortOptions(!showSortOptions)}
              className="min-w-32"
            >
              <SortAsc className="h-4 w-4 mr-2" />
              {getSortLabel()}
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
            
            {showSortOptions && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-lg min-w-48">
                {sortOptions.map((option) => (
                  <div key={option.value} className="border-b last:border-b-0">
                    <div className="px-3 py-2 text-sm font-medium text-muted-foreground">
                      {option.label}
                    </div>
                    {option.orders.map((order) => (
                      <button
                        key={`${option.value}-${order}`}
                        className={`w-full px-6 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground ${
                          sortBy === option.value && sortOrder === order
                            ? "bg-accent text-accent-foreground"
                            : ""
                        }`}
                        onClick={() => {
                          onSortChange(option.value, order)
                          setShowSortOptions(false)
                        }}
                      >
                        {order === "asc" ? "Low to High" : "High to Low"} {order === "asc" ? "↑" : "↓"}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Flight Cards */}
      <div className="space-y-4">
        {flights.map((flight) => (
          <FlightCard key={flight.id} flight={flight} />
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center pt-4">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            size="lg"
          >
            {isLoadingMore ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                Loading more flights...
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-2" />
                Load More Flights
              </>
            )}
          </Button>
        </div>
      )}

      {/* Loading More Indicator */}
      {isLoadingMore && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={`loading-${i}`} className="border-0 bg-card/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 lg:w-48">
                    <Skeleton className="w-8 h-8 rounded" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-center space-y-1">
                        <Skeleton className="h-8 w-16 mx-auto" />
                        <Skeleton className="h-4 w-12 mx-auto" />
                      </div>
                      <div className="flex-1 px-4 space-y-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-20 mx-auto" />
                      </div>
                      <div className="text-center space-y-1">
                        <Skeleton className="h-8 w-16 mx-auto" />
                        <Skeleton className="h-4 w-12 mx-auto" />
                      </div>
                    </div>
                  </div>
                  <div className="lg:w-32 space-y-2">
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-4 w-16 mx-auto" />
                  </div>
                  <div className="lg:w-40 space-y-2">
                    <Skeleton className="h-8 w-20 ml-auto" />
                    <Skeleton className="h-4 w-16 ml-auto" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}