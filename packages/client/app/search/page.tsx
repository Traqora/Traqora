"use client"

import { useState } from "react"
import { SearchForm, SearchFormData } from "@/components/flight-search/search-form"
import { ResultsList } from "@/components/flight-search/results-list"
import { useFlightSearch } from "@/hooks/use-flight-search"

export default function SearchPage() {
  const { flights, isLoading, error, searchFlights } = useFlightSearch()
  const [query, setQuery] = useState("")

  const handleSearch = async (data: SearchFormData) => {
    setQuery(`${data.from} to ${data.to}`)
    await searchFlights({
      from: data.from,
      to: data.to,
      date: data.departure,
      passengers: Number(data.passengers),
      class: data.class,
      sort: "price",
      sort_order: "asc",
    })
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground">Find flights</h1>
          <p className="mt-2 text-muted-foreground">Search live inventory and book with Stellar-backed confirmation.</p>
        </div>

        <div className="space-y-8">
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />
          <ResultsList
            flights={flights}
            isLoading={isLoading}
            error={error}
            hasMore={false}
            onLoadMore={() => undefined}
            isLoadingMore={false}
            totalResults={flights.length}
            searchQuery={query}
          />
        </div>
      </div>
    </main>
  )
}
