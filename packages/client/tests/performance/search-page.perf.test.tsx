/**
 * Performance regression tests for the Flight Search page.
 * Measures render times for the search page with various states.
 */

import React from 'react'
import { render } from '@testing-library/react'
import { measureRender, assertRenderThresholds } from './perf-utils'

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams('origin=JFK&destination=LHR&date=2026-08-01'),
}))

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}))

jest.mock('@/hooks/use-flight-search', () => ({
  useFlightSearch: () => ({
    results: Array.from({ length: 25 }, (_, i) => ({
      id: `FL${i}`,
      airline: ['AA', 'DL', 'UA', 'BA', 'LH'][i % 5],
      flightNumber: `${['AA', 'DL', 'UA', 'BA', 'LH'][i % 5]}${100 + i}`,
      departure: '2026-08-01T08:00:00Z',
      arrival: '2026-08-01T20:00:00Z',
      duration: 420 + i * 10,
      stops: i % 3 === 0 ? 1 : 0,
      priceCents: 30000 + i * 1000,
      seatsAvailable: 10 + (i % 40),
      rating: 4.0 + (i % 10) * 0.1,
    })),
    isLoading: false,
    error: null,
    search: jest.fn(),
    totalCount: 100,
    hasMore: true,
    loadMore: jest.fn(),
  }),
}))

jest.mock('@/components/flight-search/search-form', () => ({
  SearchForm: () => React.createElement('div', { 'data-testid': 'search-form' }, 'SearchForm'),
}))

jest.mock('@/components/flight-search/filter-panel', () => ({
  FilterPanel: () => React.createElement('div', { 'data-testid': 'filter-panel' }, 'FilterPanel'),
  FilterOptions: {},
}))

jest.mock('@/components/flight-search/results-list', () => ({
  ResultsList: () => React.createElement('div', { 'data-testid': 'results-list' }, 'ResultsList'),
}))

jest.mock('@/components/flight-search/FlexibleDateSearchPanel', () => ({
  FlexibleDateSearchPanel: () => React.createElement('div', null, 'Flexible'),
}))

jest.mock('@/components/flight-search/price-trend-sparkline', () => ({
  PriceTrendSparkline: () => React.createElement('div', null, 'Sparkline'),
}))

jest.mock('@/components/flight-comparison', () => ({
  FlightComparison: () => React.createElement('div', null, 'Comparison'),
}))

jest.mock('@/lib/api', () => ({
  apiClient: { get: jest.fn().mockResolvedValue({ data: [] }) },
  SavedSearch: {},
  SearchHistoryEntry: {},
}))

describe('SearchPage Render Performance', () => {
  it('should render search page with results within 150ms', async () => {
    const SearchPage = require('@/app/search/page').default

    const stats = await measureRender(() => {
      render(React.createElement(SearchPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 150, maxMs: 300 })
  })

  it('should render search page loading state within 100ms', async () => {
    jest.mock('@/hooks/use-flight-search', () => ({
      useFlightSearch: () => ({
        results: [],
        isLoading: true,
        error: null,
        search: jest.fn(),
        totalCount: 0,
        hasMore: false,
        loadMore: jest.fn(),
      }),
    }))

    const SearchPage = require('@/app/search/page').default

    const stats = await measureRender(() => {
      render(React.createElement(SearchPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })

  it('should render search page empty state within 100ms', async () => {
    jest.mock('@/hooks/use-flight-search', () => ({
      useFlightSearch: () => ({
        results: [],
        isLoading: false,
        error: null,
        search: jest.fn(),
        totalCount: 0,
        hasMore: false,
        loadMore: jest.fn(),
      }),
    }))

    const SearchPage = require('@/app/search/page').default

    const stats = await measureRender(() => {
      render(React.createElement(SearchPage))
    }, 10, 3)

    assertRenderThresholds(stats, { meanMaxMs: 100, maxMs: 200 })
  })
})
