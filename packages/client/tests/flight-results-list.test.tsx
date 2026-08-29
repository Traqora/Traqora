import { fireEvent, render, screen } from '@testing-library/react'
import { ResultsList } from '@/components/flight-search/results-list'
import type { Flight } from '@/components/flight-search/flight-card'

const flights: Flight[] = [
  {
    id: 'fl1',
    from: 'JFK',
    to: 'LAX',
    fromCity: 'New York',
    toCity: 'Los Angeles',
    departure_time: '2026-09-01T08:30:00Z',
    arrival_time: '2026-09-01T11:45:00Z',
    airline: 'AA',
    airline_name: 'American Airlines',
    stops: 0,
    duration: 195,
    price: 450,
    rating: 4.5,
    available_seats: 3,
    class: 'economy',
    aircraft: 'Boeing 737-800',
    amenities: ['WiFi'],
  },
  {
    id: 'fl2',
    from: 'JFK',
    to: 'LAX',
    departure_time: '2026-09-01T12:00:00Z',
    arrival_time: '2026-09-01T15:30:00Z',
    airline: 'DL',
    airline_name: 'Delta Air Lines',
    stops: 1,
    duration: 210,
    price: 520,
    rating: 4.2,
    available_seats: 1,
    class: 'business',
  },
]

const baseProps = {
  flights,
  isLoading: false,
  error: null as string | null,
  hasMore: false,
  onLoadMore: jest.fn(),
  isLoadingMore: false,
  totalResults: 2,
}

describe('ResultsList', () => {
  it('renders loading skeletons while a search is in flight and no results exist yet', () => {
    const { container } = render(
      <ResultsList {...baseProps} flights={[]} isLoading totalResults={undefined} />,
    )

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText(/no flights found/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/flights found/i)).not.toBeInTheDocument()
  })

  it('shows an error card with the message and a retry action', () => {
    render(<ResultsList {...baseProps} flights={[]} error="The flight service is unavailable" />)

    expect(screen.getByText('Search Error')).toBeInTheDocument()
    expect(screen.getByText('The flight service is unavailable')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument()
  })

  it('shows the empty state when a search returns no results', () => {
    render(
      <ResultsList {...baseProps} flights={[]} totalResults={0} searchQuery="CDG" />,
    )

    expect(screen.getByText('No flights found')).toBeInTheDocument()
    expect(
      screen.getByText('No flights match your search criteria for "CDG"'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Search' })).toBeInTheDocument()
  })

  it('renders the result count and a flight card per flight', () => {
    render(<ResultsList {...baseProps} />)

    expect(screen.getByText('2 flights found')).toBeInTheDocument()
    expect(screen.getByText('$450')).toBeInTheDocument()
    expect(screen.getByText('$520')).toBeInTheDocument()
    expect(screen.getAllByText('LAX').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('button', { name: 'Book Now' })).toHaveLength(2)
  })

  it('exposes sort controls only when an onSortChange handler is provided and applies a sort', () => {
    const onSortChange = jest.fn()
    render(
      <ResultsList {...baseProps} onSortChange={onSortChange} />,
    )

    const sortButton = screen.getByRole('button', { name: /sort results/i })
    expect(screen.queryByText('Duration')).not.toBeInTheDocument()

    fireEvent.click(sortButton)
    expect(screen.getByText('Duration')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /low to high/i })[1])
    expect(onSortChange).toHaveBeenCalledWith('duration', 'asc')
  })

  it('does not render sort controls without an onSortChange handler', () => {
    render(<ResultsList {...baseProps} />)

    expect(screen.queryByRole('button', { name: /sort results/i })).not.toBeInTheDocument()
  })

  it('calls onLoadMore when there are more results, and shows the loading-more state', () => {
    const onLoadMore = jest.fn()
    const { rerender } = render(<ResultsList {...baseProps} hasMore onLoadMore={onLoadMore} />)

    fireEvent.click(screen.getByRole('button', { name: /load more flights/i }))
    expect(onLoadMore).toHaveBeenCalledTimes(1)

    rerender(
      <ResultsList {...baseProps} hasMore onLoadMore={onLoadMore} isLoadingMore />,
    )
    expect(screen.getByText('Loading more flights...')).toBeInTheDocument()
  })

  it('renders comparison checkboxes and toggles selection when compare is enabled', () => {
    const onToggleCompare = jest.fn()
    render(
      <ResultsList
        {...baseProps}
        compareSelectable
        compareSelectedIds={['fl1']}
        onToggleCompare={onToggleCompare}
      />,
    )

    const checkbox = screen.getByRole('checkbox', {
      name: 'Select American Airlines flight for comparison',
    })
    expect(checkbox).toBeInTheDocument()
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)
    expect(onToggleCompare).toHaveBeenCalledWith('fl1')
  })
})