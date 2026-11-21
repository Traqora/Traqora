import { fireEvent, render, screen } from '@testing-library/react'
import { ResultsList } from '@/components/flight-search/results-list'
import { getSearchUiState, SearchStateInput } from '@/components/flight-search/search-state'
import type { Flight } from '@/components/flight-search/flight-card'

const flights: Flight[] = [
  {
    id: 'fl1',
    from: 'JFK',
    to: 'LAX',
    departure_time: '2026-09-01T08:30:00Z',
    airline: 'AA',
    airline_name: 'American Airlines',
    stops: 0,
    duration: 195,
    price: 450,
    rating: 4.5,
    available_seats: 3,
    class: 'economy',
  },
]

const baseProps = {
  flights,
  isLoading: false,
  error: null as string | null,
  hasMore: false,
  onLoadMore: jest.fn(),
  isLoadingMore: false,
  totalResults: 1,
}

describe('getSearchUiState (issue #672 contract)', () => {
  const cases: Array<[SearchStateInput, string, string]> = [
    [{ hasSearched: false, isLoading: false, error: null, resultCount: 0 }, 'idle', 'no search submitted yet'],
    [{ hasSearched: false, isLoading: true, error: null, resultCount: 0 }, 'loading', 'first results in flight'],
    [{ hasSearched: true, isLoading: false, error: null, resultCount: 2 }, 'success', 'happy path with results'],
    [{ hasSearched: true, isLoading: false, error: null, resultCount: 0 }, 'empty', 'search completed without matches'],
    [{ hasSearched: true, isLoading: false, error: 'API down', resultCount: 0 }, 'error', 'request failed'],
  ]

  it.each(cases)('maps %s to %s (%s)', (input, expected) => {
    expect(getSearchUiState(input)).toBe(expected)
  })

  it('error has the highest priority, even with results and a running request', () => {
    expect(getSearchUiState({ hasSearched: true, isLoading: true, error: 'boom', resultCount: 5 })).toBe('error')
  })

  it('treats resultCount > 0 as success regardless of the loading flag', () => {
    expect(getSearchUiState({ hasSearched: true, isLoading: true, error: null, resultCount: 3 })).toBe('success')
  })
})

describe('ResultsList flight search UI states (issue #672)', () => {
  it('renders the distinct idle state before any search has been submitted', () => {
    render(<ResultsList {...baseProps} flights={[]} totalResults={0} hasSearched={false} />)

    expect(screen.getByText('Start a flight search')).toBeInTheDocument()
    expect(screen.queryByText('No flights found')).not.toBeInTheDocument()
  })

  it('keeps the empty state for a completed search that returned nothing', () => {
    render(<ResultsList {...baseProps} flights={[]} totalResults={0} hasSearched searchQuery="CDG" />)

    expect(screen.getByText('No flights found')).toBeInTheDocument()
    expect(screen.queryByText('Start a flight search')).not.toBeInTheDocument()
  })

  it('defaults to the empty state when hasSearched is not provided, preserving prior behavior', () => {
    render(<ResultsList {...baseProps} flights={[]} totalResults={0} />)

    expect(screen.getByText('No flights found')).toBeInTheDocument()
  })

  it('invokes the provided onRetry handler instead of reloading the page', () => {
    const onRetry = jest.fn()
    render(<ResultsList {...baseProps} flights={[]} error="The flight service is unavailable" hasSearched onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('failure mode: with no retry handler the fallback reload is still wired to the retry button', () => {
    // jsdom marks window.location.reload read-only, so observe the reload via the
    // "Not implemented: window.location.reload" console error jsdom emits on click.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    render(<ResultsList {...baseProps} flights={[]} error="boom" hasSearched />)

    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
    // jsdom reports the attempted reload/navigation as a console error
    expect(
      consoleError.mock.calls.some((call) => String(call[0]).includes('Not implemented')),
    ).toBe(true)
    consoleError.mockRestore()
  })

  it('loading state takes precedence over the idle state on first load', () => {
    const { container } = render(
      <ResultsList {...baseProps} flights={[]} isLoading totalResults={undefined} hasSearched={false} />,
    )

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('Start a flight search')).not.toBeInTheDocument()
  })
})
