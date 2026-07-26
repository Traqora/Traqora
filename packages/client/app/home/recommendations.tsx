"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plane, TrendingUp } from "lucide-react"
import Link from "next/link"

interface DestinationRecommendation {
  destination: string
  city: string
  country: string
  reason: 'preference_match' | 'booking_history' | 'trending'
  score: number
  averagePriceCents: number
}

export function HomeRecommendations() {
  const [recommendations, setRecommendations] = useState<DestinationRecommendation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/v1/recommendations/destinations")
      .then((res) => res.json())
      .then((data) => {
        setRecommendations(data.recommendations || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const getReasonLabel = (reason: DestinationRecommendation['reason']) => {
    switch (reason) {
      case 'preference_match':
        return 'Matches your preferences'
      case 'booking_history':
        return 'You\'ve been here before'
      default:
        return 'Trending now'
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-serif font-bold">Recommended for You</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-48 bg-muted/50" />
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return null
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-serif font-bold">Recommended for You</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {recommendations.map((rec) => (
          <Card key={rec.destination} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  {rec.city}, {rec.country}
                </CardTitle>
                <Badge variant={rec.reason === 'preference_match' ? 'default' : 'secondary'}>
                  {rec.reason === 'preference_match' ? 'For You' : rec.reason === 'booking_history' ? 'Visited' : 'Trending'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{getReasonLabel(rec.reason)}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">From</span>
                <span className="font-bold text-primary">${(rec.averagePriceCents / 100).toFixed(2)}</span>
              </div>
              <Link href={`/search?to=${rec.destination}&departure=${new Date(Date.now() + 86400000).toISOString().split('T')[0]}&passengers=1&class=economy`}>
                <Button className="w-full" size="sm">
                  <Plane className="mr-2 h-4 w-4" />
                  Search Flights
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
