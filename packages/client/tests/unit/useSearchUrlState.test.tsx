import { renderHook, act } from "@testing-library/react"
import { useSearchUrlState } from "../../hooks/lib/useSearchUrlState"
import { FilterOptions } from "../../components/flight-search/filter-panel"

const mockReplace = jest.fn()
let mockSearchParams = new URLSearchParams()

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
  useSearchParams: () => mockSearchParams,
}))

const defaultFilters: FilterOptions = {
  priceRange: [50, 1000],
  airlines: ["AA", "DL"],
  stops: [0, 1],
  departureWindow: [],
  maxDuration: 720,
  sortBy: "price",
  sortOrder: "asc",
}

describe("useSearchUrlState", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = new URLSearchParams()
  })

  it("returns default filters when URL search params are empty", () => {
    const { result } = renderHook(() => useSearchUrlState(defaultFilters))
    const filters = result.current.getFiltersFromUrl()
    expect(filters).toEqual(defaultFilters)
  })

  it("correctly parses filters from URL parameters (happy path)", () => {
    mockSearchParams = new URLSearchParams(
      "price_min=100&price_max=800&airlines=UA,B6&stops=0&duration_max=500&sort=duration&sort_order=desc"
    )

    const { result } = renderHook(() => useSearchUrlState(defaultFilters))
    const filters = result.current.getFiltersFromUrl()

    expect(filters.priceRange).toEqual([100, 800])
    expect(filters.airlines).toEqual(["UA", "B6"])
    expect(filters.stops).toEqual([0])
    expect(filters.maxDuration).toEqual(500)
    expect(filters.sortBy).toEqual("duration")
    expect(filters.sortOrder).toEqual("desc")
  })

  it("handles invalid or malformed URL parameters gracefully (failure mode)", () => {
    mockSearchParams = new URLSearchParams(
      "price_min=not-a-number&price_max=NaN&airlines=&stops=invalid&duration_max=abc"
    )

    const { result } = renderHook(() => useSearchUrlState(defaultFilters))
    const filters = result.current.getFiltersFromUrl() 

    // Falls back to Number(NaN) or parsed values robustly without throwing
    expect(isNaN(filters.priceRange[0])).toBe(true)
    expect(filters.maxDuration).toBeNaN()
    expect(filters.airlines).toEqual([""])
  })

  it("serializes filters to URL parameters and calls router.replace", () => {
    const { result } = renderHook(() => useSearchUrlState(defaultFilters))

    const updatedFilters: FilterOptions = {
      priceRange: [200, 600],
      airlines: ["WN"],
      stops: [1],
      departureWindow: [],
      maxDuration: 400,
      sortBy: "price",
      sortOrder: "asc",
    }

    act(() => {
      result.current.setFiltersToUrl(updatedFilters)
    })

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("price_min=200"),
      { scroll: false }
    )
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("price_max=600"),
      { scroll: false }
    )
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("airlines=WN"),
      { scroll: false }
    )
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("duration_max=400"),
      { scroll: false }
    )
  })
})
