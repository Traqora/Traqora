"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, X, Trash2 } from "lucide-react"
import { SearchFormData } from "./search-form"

interface RecentSearch extends SearchFormData {
  timestamp: number
  id: string
}

const STORAGE_KEY = "traqora_recent_searches"

export function saveRecentSearch(search: SearchFormData) {
  try {
    const newSearch: RecentSearch = {
      ...search,
      timestamp: Date.now(),
      id: `${Date.now()}-${Math.random()}`
    }

    const stored = localStorage.getItem(STORAGE_KEY)
    const existing: RecentSearch[] = stored ? JSON.parse(stored) : []

    const filtered = existing.filter(
      s => s.from !== search.from || s.to !== search.to || s.departure !== search.departure
    )

    const updated = [newSearch, ...filtered].slice(0, 5)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch (error) {
    console.error("Failed to save recent search:", error)
  }
}

export function RecentSearches({ onSelect }: { onSelect: (search: SearchFormData) => void }) {
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([])

  useEffect(() => {
    const loadRecentSearches = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY)
        if (stored) {
          const searches: RecentSearch[] = JSON.parse(stored)
          setRecentSearches(searches.slice(0, 5)) // Keep only last 5
        }
      } catch (error) {
        console.error("Failed to load recent searches:", error)
      }
    }

    loadRecentSearches()
  }, [])

  const saveSearch = (search: SearchFormData) => {
    try {
      const newSearch: RecentSearch = {
        ...search,
        timestamp: Date.now(),
        id: `${Date.now()}-${Math.random()}`
      }

      const existing = recentSearches.filter(
        s => s.from !== search.from || s.to !== search.to || s.departure !== search.departure
      )

      const updated = [newSearch, ...existing].slice(0, 5)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setRecentSearches(updated)
    } catch (error) {
      console.error("Failed to save recent search:", error)
    }
  }

  const clearAll = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
      setRecentSearches([])
    } catch (error) {
      console.error("Failed to clear recent searches:", error)
    }
  }

  const removeSearch = (id: string) => {
    try {
      const updated = recentSearches.filter(s => s.id !== id)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      setRecentSearches(updated)
    } catch (error) {
      console.error("Failed to remove recent search:", error)
    }
  }

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000)

    if (seconds < 60) return "Just now"
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  if (recentSearches.length === 0) {
    return null
  }

  return (
    <Card className="border-0 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold">Recent Searches</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear All
          </Button>
        </div>

        <div className="space-y-2">
          {recentSearches.map((search) => (
            <div
              key={search.id}
              className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors group"
            >
              <button
                className="flex-1 text-left"
                onClick={() => onSelect(search)}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{search.from}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{search.to}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{search.passengers} passenger{search.passengers !== "1" ? "s" : ""}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {search.departure} {search.tripType === "roundtrip" && `→ ${search.return || "Return"}`}
                </div>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(search.timestamp)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                  onClick={() => removeSearch(search.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
