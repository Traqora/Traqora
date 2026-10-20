"use client"


import { SearchForm, SearchFormData } from "@/components/flight-search/search-form"
import { FilterPanel, FilterOptions } from "@/components/flight-search/filter-panel"
import { ResultsList } from "@/components/flight-search/results-list"
import { DateFlexSearch } from "@/components/flight-search/date-flex-search"
import { PriceTrendSparkline } from "@/components/flight-search/price-trend-sparkline"
import { FlightComparison } from "@/components/flight-comparison"
import { useFlightSearch } from "@/hooks/use-flight-search"
import { useSearchUrlState } from "@/hooks/lib/useSearchUrlState"
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

  const { getFiltersFromUrl, setFiltersToUrl } = useSearchUrlState(DEFAULT_FILTERS)

  useEffect(() => {
    const initial = {
      ...loadStoredFilters(),
      ...getFiltersFromUrl(),
    }
    setFilters(initial)
  }, [getFiltersFromUrl])

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
    setFiltersToUrl(next)
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

  // Retry the most recent search in place instead of reloading the whole page (issue #672)
  const handleRetrySearch = useCallback(() => {
    if (!lastQuery) return
    runSearch(lastQuery, filters)
  }, [lastQuery, filters, runSearch])

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

            <ResultsList
              flights={flights}
              isLoading={isLoading}
              error={error}
              hasSearched={lastQuery !== null}
              onRetry={lastQuery ? handleRetrySearch : undefined}
              hasMore={false}

            />
          </div>
        </div>
      </div>

  )
}
