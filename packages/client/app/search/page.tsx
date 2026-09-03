"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Plane, Calendar, BarChart3, Keyboard, Bookmark, History, Trash2, Share2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NavWalletButton } from "@/components/nav-wallet-button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

import { SearchForm, SearchFormData } from "@/components/flight-search/search-form"
import { FilterPanel, FilterOptions } from "@/components/flight-search/filter-panel"
import { ResultsList } from "@/components/flight-search/results-list"
import { FlexibleDateSearchPanel } from "@/components/flight-search/FlexibleDateSearchPanel"
import { PriceTrendSparkline } from "@/components/flight-search/price-trend-sparkline"
import { FlightComparison } from "@/components/flight-comparison"
import { useFlightSearch } from "@/hooks/use-flight-search"
import { apiClient, SavedSearch, SearchHistoryEntry } from "@/lib/api"
import { buildSearchShareLink, decodeSearchQueryFromUrl } from "@/lib/search-sharing"

const FILTERS_STORAGE_KEY = "traqora:flight-search-filters"
const MAX_COMPARE = 3
const FILTER_DEBOUNCE_MS = 400

const DEFAULT_FILTERS: FilterOptions = {
  priceRange: [50, 1000],
  airlines: [],
  stops: [],
  departureWindow: [],
  maxDuration: 720,
  sortBy: "price",
  sortOrder: "asc",
}

function loadStoredFilters(): FilterOptions {
  if (typeof window === "undefined") return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(FILTERS_STORAGE_KEY)
    if (!raw) return DEFAULT_FILTERS
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_FILTERS
  }
}

function departureWindowToHours(window: string): [number, number] | null {
  switch (window) {
    case "early":
      return [6, 12]
    case "afternoon":
      return [12, 18]
    case "evening":
      return [18, 24]
    case "night":
      return [0, 6]
    default:
      return null
  }
}

function toSearchMemoryPayload(query: SearchFormData) {
  return {
    from: query.from.toUpperCase(),
    to: query.to.toUpperCase(),
    date: query.departure,
    passengers: parseInt(query.passengers, 10),
    class: query.class,
  }
}

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { flights, isLoading, error, searchFlights, isFromCache } = useFlightSearch()

  const [searchMode, setSearchMode] = useState<"exact" | "flexible">("exact")
  const [isFilterOpen, setIsFilterOpen] = useState(true)
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS)
  const [lastQuery, setLastQuery] = useState<SearchFormData | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showComparison, setShowComparison] = useState(false)
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([])
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [isMemoryLoading, setIsMemoryLoading] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setFilters(loadStoredFilters())
  }, [])

  useEffect(() => {
    let isMounted = true
    const loadSearchMemory = async () => {
      setIsMemoryLoading(true)
      const [historyResponse, savedResponse] = await Promise.all([
        apiClient.getSearchHistory(),
        apiClient.getSavedSearches(),
      ])
      if (!isMounted) return

      if (historyResponse.success) {
        setSearchHistory(historyResponse.data)
      }
      if (savedResponse.success) {
        setSavedSearches(savedResponse.data)
      }
      setIsMemoryLoading(false)
    }
    loadSearchMemory()
    return () => {
      isMounted = false
    }
  }, [])

  const runSearch = useCallback(
    (query: SearchFormData, activeFilters: FilterOptions) => {
      searchFlights({
        from: query.from.toUpperCase(),
        to: query.to.toUpperCase(),
        date: query.departure,
        passengers: parseInt(query.passengers, 10),
        class: query.class,
        price_min: activeFilters.priceRange[0],
        price_max: activeFilters.priceRange[1],
        airlines: activeFilters.airlines.length > 0 ? activeFilters.airlines : undefined,
        stops: activeFilters.stops.length > 0 ? activeFilters.stops : undefined,
        duration_max: activeFilters.maxDuration,
        sort: activeFilters.sortBy,
        sort_order: activeFilters.sortOrder,
      })
    },
    [searchFlights],
  )

  // Prefill from URL query params (bookmarkable/shareable searches)
  useEffect(() => {
    const decoded = decodeSearchQueryFromUrl(searchParams.toString())
    if (decoded) {
      const query: SearchFormData = {
        from: decoded.from,
        to: decoded.to,
        departure: decoded.date,
        passengers: String(decoded.passengers),
        class: decoded.class,
      }
      setLastQuery(query)
      runSearch(query, loadStoredFilters())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSearch = (data: SearchFormData) => {
    setLastQuery(data)
    setCompareIds([])
    setShowComparison(false)

    const params = new URLSearchParams({
      from: data.from,
      to: data.to,
      date: data.departure,
      passengers: data.passengers,
      class: data.class,
    })
    router.replace(`/search?${params.toString()}`)
    runSearch(data, filters)

    void apiClient.addSearchHistory(toSearchMemoryPayload(data)).then((response) => {
      if (response.success) {
        setSearchHistory((prev) => [response.data, ...prev.filter((item) => item.id !== response.data.id)].slice(0, 10))
      }
    })
  }

  const handleDateSelect = (date: string) => {
    if (!lastQuery) return
    const query = { ...lastQuery, departure: date }
    setSearchMode("exact")
    handleSearch(query)
  }

  const persistFilters = (next: FilterOptions) => {
    setFilters(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next))
    }
  }

  // Real-time filtering: debounce so results update shortly after the user stops adjusting filters
  const handleFiltersChange = (next: FilterOptions) => {
    persistFilters(next)
    if (!lastQuery) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSearch(lastQuery, next)
    }, FILTER_DEBOUNCE_MS)
  }

  const handleClearFilters = useCallback(() => {
    persistFilters(DEFAULT_FILTERS)
    if (lastQuery) runSearch(lastQuery, DEFAULT_FILTERS)
    toast({ title: "Filters cleared" })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastQuery, runSearch, toast])

  const handleToggleCompare = useCallback(
    (flightId: string) => {
      setCompareIds((prev) => {
        if (prev.includes(flightId)) return prev.filter((id) => id !== flightId)
        if (prev.length >= MAX_COMPARE) {
          toast({
            title: "Comparison limit reached",
            description: `You can compare up to ${MAX_COMPARE} flights at a time.`,
            variant: "destructive",
          })
          return prev
        }
        return [...prev, flightId]
      })
    },
    [toast],
  )

  // Keyboard shortcuts: "c" clears filters, "v" opens the comparison view — ignored while typing in a field
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isTyping =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable
      if (isTyping) return

      if (event.key === "c") {
        handleClearFilters()
      } else if (event.key === "v") {
        if (compareIds.length >= 2) {
          setShowComparison(true)
        } else {
          toast({
            title: "Select flights to compare",
            description: "Choose at least 2 flights using the checkboxes on each result.",
          })
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [compareIds, handleClearFilters, toast])

  const availableAirlines = useMemo(() => {
    const set = new Set(flights.map((f) => f.airline))
    return set.size > 0 ? Array.from(set) : undefined
  }, [flights])

  const selectedFlightsForComparison = flights.filter((f) => compareIds.includes(f.id))
  const applySearchMemory = (query: SearchFormData) => {
    handleSearch(query)
  }

  const saveCurrentSearch = async () => {
    if (!lastQuery) return
    const name = typeof window !== "undefined" ? window.prompt("Optional name for this saved search") || "" : ""
    const response = await apiClient.createSavedSearch({ ...toSearchMemoryPayload(lastQuery), name })
    if (!response.success) {
      toast({ title: "Failed to save search", description: response.error.message, variant: "destructive" })
      return
    }
    setSavedSearches((prev) => [response.data, ...prev])
    toast({ title: "Search saved" })
  }

  const shareCurrentSearch = async () => {
    if (!lastQuery) return
    const { url } = buildSearchShareLink(toSearchMemoryPayload(lastQuery))
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url)
        toast({ title: "Share link copied to clipboard" })
        return
      } catch {
        // fall through to legacy fallback below
      }
    }
    if (typeof window !== "undefined") {
      window.prompt("Copy this share link", url)
    }
  }

  const handleClearAllHistory = async () => {
    if (typeof window !== "undefined" && !window.confirm("Remove all recent searches? This cannot be undone.")) {
      return
    }
    const response = await apiClient.clearSearchHistory()
    if (!response.success) {
      toast({ title: "Failed to clear history", description: response.error.message, variant: "destructive" })
      return
    }
    setSearchHistory([])
    toast({ title: `Cleared ${response.data.deletedCount} search${response.data.deletedCount === 1 ? "" : "es"}` })
  }

  const handleClearAllSaved = async () => {
    if (typeof window !== "undefined" && !window.confirm("Remove all saved searches? This cannot be undone.")) {
      return
    }
    const response = await apiClient.clearSavedSearches()
    if (!response.success) {
      toast({ title: "Failed to clear saved searches", description: response.error.message, variant: "destructive" })
      return
    }
    setSavedSearches([])
    toast({ title: `Cleared ${response.data.deletedCount} saved search${response.data.deletedCount === 1 ? "" : "es"}` })
  }

  const handleExportSearchData = async () => {
    const response = await apiClient.exportSearchData()
    if (!response.success) {
      toast({ title: "Failed to export search data", description: response.error.message, variant: "destructive" })
      return
    }
    if (typeof window === "undefined") return
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = objectUrl
    anchor.download = `traqora-search-data-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(objectUrl)
    toast({ title: "Search data exported" })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation — landmark: banner */}
      <header role="banner">
        <nav aria-label="Main navigation" className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center space-x-2">
                <Plane className="h-8 w-8 text-primary" aria-hidden="true" />
                <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
              </div>
              <div className="hidden md:flex items-center space-x-8">
                <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
                <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
                  Dashboard
                </Link>
                <Link href="/governance" className="text-muted-foreground hover:text-foreground transition-colors">
                  Governance
                </Link>
                <NavWalletButton />
              </div>
            </div>
          </div>
        </nav>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif font-bold text-3xl text-foreground flex items-center gap-2">
            <Plane className="h-7 w-7 text-primary" aria-hidden="true" />
            Search Flights
          </h1>
          <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            <Keyboard className="h-3 w-3" />
            Press <Badge variant="outline" className="px-1.5 py-0">c</Badge> to clear filters,{" "}
            <Badge variant="outline" className="px-1.5 py-0">v</Badge> to compare selected
          </span>
        </div>

        <Tabs value={searchMode} onValueChange={(v) => setSearchMode(v as "exact" | "flexible")}>
          <TabsList>
            <TabsTrigger value="exact">
              <Calendar className="h-4 w-4 mr-2" />
              Exact Dates
            </TabsTrigger>
            <TabsTrigger value="flexible">
              <BarChart3 className="h-4 w-4 mr-2" />
              Flexible Dates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="exact" className="mt-4">
            <SearchForm onSearch={handleSearch} isLoading={isLoading} initialValues={lastQuery || undefined} />
          </TabsContent>

          <TabsContent value="flexible" className="mt-4">
            <FlexibleDateSearchPanel
              from={lastQuery?.from || "JFK"}
              to={lastQuery?.to || "LAX"}
              passengers={lastQuery ? parseInt(lastQuery.passengers, 10) : 1}
              travelClass={lastQuery?.class}
              onDateSelect={handleDateSelect}
            />
          </TabsContent>
        </Tabs>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Recent Searches
              </CardTitle>
              {searchHistory.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleClearAllHistory}
                  aria-label="Clear all recent searches"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear all
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {isMemoryLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!isMemoryLoading && searchHistory.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent searches yet.</p>
              )}
              {searchHistory.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                  <button
                    className="text-left text-sm hover:underline"
                    onClick={() =>
                      applySearchMemory({
                        from: item.fromAirport,
                        to: item.toAirport,
                        departure: item.departureDate,
                        passengers: String(item.passengers),
                        class: item.cabinClass,
                      })
                    }
                  >
                    {item.fromAirport} → {item.toAirport} · {item.departureDate}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const response = await apiClient.deleteSearchHistory(item.id)
                      if (response.success) setSearchHistory((prev) => prev.filter((entry) => entry.id !== item.id))
                    }}
                    aria-label={`Remove search history: ${item.fromAirport} to ${item.toAirport}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-primary" />
                Saved Searches
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={shareCurrentSearch} disabled={!lastQuery}>
                  <Share2 className="h-4 w-4 mr-1" />
                  Share
                </Button>
                <Button size="sm" variant="outline" onClick={saveCurrentSearch} disabled={!lastQuery}>
                  Save Current
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isMemoryLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {!isMemoryLoading && savedSearches.length === 0 && (
                <p className="text-sm text-muted-foreground">No saved searches yet.</p>
              )}
              {savedSearches.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                  <button
                    className="text-left text-sm hover:underline"
                    onClick={() =>
                      applySearchMemory({
                        from: item.fromAirport,
                        to: item.toAirport,
                        departure: item.departureDate,
                        passengers: String(item.passengers),
                        class: item.cabinClass,
                      })
                    }
                  >
                    <span className="font-medium">{item.name || `${item.fromAirport} → ${item.toAirport}`}</span>
                    <span className="text-muted-foreground"> · {item.departureDate}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      const response = await apiClient.deleteSavedSearch(item.id)
                      if (response.success) setSavedSearches((prev) => prev.filter((entry) => entry.id !== item.id))
                    }}
                    aria-label={`Remove saved search: ${item.name || `${item.fromAirport} to ${item.toAirport}`}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
              {savedSearches.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    {savedSearches.length} saved · manage privacy
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleExportSearchData}
                      aria-label="Export search history and saved searches as JSON"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleClearAllSaved}
                      aria-label="Clear all saved searches"
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear all
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {lastQuery && <PriceTrendSparkline from={lastQuery.from} to={lastQuery.to} />}

        {compareIds.length >= 2 && (
          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium">
              {compareIds.length} flight{compareIds.length > 1 ? "s" : ""} selected for comparison
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setCompareIds([])}>
                Clear Selection
              </Button>
              <Button size="sm" onClick={() => setShowComparison(true)}>
                <BarChart3 className="h-4 w-4 mr-1" />
                Compare Selected
              </Button>
            </div>
          </div>
        )}

        {showComparison && selectedFlightsForComparison.length >= 2 && (
          <FlightComparison
            flights={selectedFlightsForComparison}
            selectedFlights={compareIds}
            onSelect={setCompareIds}
            maxCompare={MAX_COMPARE}
          />
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <FilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onClearFilters={handleClearFilters}
            isOpen={isFilterOpen}
            onToggle={() => setIsFilterOpen((v) => !v)}
            availableAirlines={availableAirlines}
          />

          <div className="flex-1 min-w-0">
            {isFromCache && (
              <div
                role="status"
                className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800"
              >
                Showing cached results from your last search. Reconnect to see up-to-date prices and availability.
              </div>
            )}
            <ResultsList
              flights={flights}
              isLoading={isLoading}
              error={error}
              hasMore={false}
              onLoadMore={() => {}}
              isLoadingMore={false}
              totalResults={flights.length}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              onSortChange={(sortBy, sortOrder) =>
                handleFiltersChange({
                  ...filters,
                  sortBy: sortBy as FilterOptions["sortBy"],
                  sortOrder: sortOrder as FilterOptions["sortOrder"],
                })
              }
              compareSelectable
              compareSelectedIds={compareIds}
              onToggleCompare={handleToggleCompare}
            />
          </div>
        </div>
      </div>

      {/* Footer — landmark: contentinfo */}
      <footer role="contentinfo" className="sr-only">
        <p>© {new Date().getFullYear()} Traqora. Decentralized flight booking powered by Stellar.</p>
      </footer>
    </div>
  )
}
