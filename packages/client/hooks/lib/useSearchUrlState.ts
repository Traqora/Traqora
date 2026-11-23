import { useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FilterOptions } from "@/components/flight-search/filter-panel"

export function useSearchUrlState(defaultFilters: FilterOptions) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const getFiltersFromUrl = useCallback((): FilterOptions => {
    if (!searchParams) return defaultFilters

    const priceMin = searchParams.get("price_min")
    const priceMax = searchParams.get("price_max")
    const airlines = searchParams.get("airlines")
    const stops = searchParams.get("stops")
    const maxDuration = searchParams.get("duration_max")
    const sortBy = searchParams.get("sort")
    const sortOrder = searchParams.get("sort_order")

    return {
      priceRange: [
        priceMin !== null ? Number(priceMin) : defaultFilters.priceRange[0],
        priceMax !== null ? Number(priceMax) : defaultFilters.priceRange[1],
      ],
      airlines: airlines ? airlines.split(",") : defaultFilters.airlines,
      stops: stops ? stops.split(",").map(Number) : defaultFilters.stops,
      departureWindow: defaultFilters.departureWindow,
      maxDuration: maxDuration !== null ? Number(maxDuration) : defaultFilters.maxDuration,
      sortBy: (sortBy as FilterOptions["sortBy"]) || defaultFilters.sortBy,
      sortOrder: (sortOrder as FilterOptions["sortOrder"]) || defaultFilters.sortOrder,
    }
  }, [searchParams, defaultFilters])

  const setFiltersToUrl = useCallback(
    (filters: FilterOptions) => {
      if (!searchParams) return
      const params = new URLSearchParams(searchParams.toString())

      params.set("price_min", String(filters.priceRange[0]))
      params.set("price_max", String(filters.priceRange[1]))

      if (filters.airlines.length > 0) {
        params.set("airlines", filters.airlines.join(","))
      } else {
        params.delete("airlines")
      }

      if (filters.stops.length > 0) {
        params.set("stops", filters.stops.join(","))
      } else {
        params.delete("stops")
      }

      params.set("duration_max", String(filters.maxDuration))
      params.set("sort", filters.sortBy)
      params.set("sort_order", filters.sortOrder)

      router.replace(`?${params.toString()}`, { scroll: false })
    },
    [router, searchParams]
  )

  return {
    getFiltersFromUrl,
    setFiltersToUrl,
  }
}
