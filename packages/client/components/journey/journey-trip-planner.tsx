"client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MapPin, Plus, Trash2, ArrowRight, Loader2, Sparkles, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { apiClient } from "@/lib/api"

interface FlightSegmentInput {
  origin: string
  destination: string
  date: string
  passengers: number
  travelClass?: 'economy' | 'premium_economy' | 'business' | 'first'
}

export function JourneyTripPlanner() {
  const [passengers, setPassengers] = useState<number>(1)
  const [segments, setSegments] = useState<FlightSegmentInput[]>([
    { origin: "JFK", destination: "LHR", date: "2026-09-01", passengers: 1, travelClass: "economy" },
    { origin: "LHR", destination: "CDG", date: "2026-09-05", passengers: 1, travelClass: "economy" },
  ])
  const [sortBy, setSortBy] = useState<'total_price' | 'total_duration'>("total_price")
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>("asc")
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [itinerary, setItinerary] = useState<any | null>(null)

  const addSegment = () => {
    if (segments.length >= 5) {
      toast.error("Maximum 5 segments allowed for multi-city trips")
      return
    }
    const lastSegment = segments[segments.length - 1]
    setSegments([
      ...segments,
      {
        origin: lastSegment ? lastSegment.destination : "",
        destination: "",
        date: new Date(Date.now() + 86400000 * (segments.length + 1)).toISOString().split("T")[0],
        passengers,
        travelClass: "economy",
      },
    ])
  }

  const removeSegment = (index: number) => {
    if (segments.length <= 2) {
      toast.error("Multi-city trip requires at least 2 segments")
      return
    }
    setSegments(segments.filter((_, i) => i !== index))
  }

  const updateSegment = (index: number, field: keyof FlightSegmentInput, value: any) => {
    const next = [...segments]
    next[index] = { ...next[index], [field]: value }
    setSegments(next)
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await apiClient.post('/api/v1/flights/multi-city', {
        segments: segments.map(s => ({
          ...s,
          origin: s.origin.toUpperCase(),
          destination: s.destination.toUpperCase(),
          passengers,
        })),
        passengers,
        sortBy,
        sortOrder,
      })

      if (res.success && res.data) {
        setItinerary(res.data)
        toast.success("Journey itinerary calculated successfully!")
      } else {
        throw new Error(res.error?.message || "Failed to search multi-city journey")
      }
    } catch (err: any) {
      const msg = err.message || "An unexpected error occurred while searching"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Multi-City Journey Planner
          </CardTitle>
          <CardDescription>
            Plan custom multi-stop trips and find combined itineraries with per-leg pricing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-6">
            <div className="flex items-center justify-between">
              <Label htmlFor="passengers-input" className="font-medium">Passengers</Label>
              <Input
                id="passengers-input"
                type="number"
                min={1}
                max={9}
                value={passengers}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  setPassengers(val);
                  setSegments(segments.map(s => ({ ...s, passengers: val })))
                }}
                className="w-24"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">Flight Segments ({segments.length}/5)</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSegment}
                  disabled={segments.length >= 5}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Add Leg
                </Button>
              </div>

              {segments.map((segment, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 border rounded-xl bg-card relative items-end">
                  <div className="absolute top-2 left-2 text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    Leg {index + 1}
                  </div>

                  <div className="md:col-span-3 mt-4 md:mt-0">
                    <Label htmlFor={`origin-${index}`}>Origin</Label>
                    <Input
                      id={`origin-${index}`}
                      value={segment.origin}
                      onChange={(e) => updateSegment(index, "origin", e.target.value.toUpperCase())}
                      placeholder="JFK"
                      maxLength={3}
                      required
                    />
                  </div>

                  <div className="md:col-span-3">
                    <Label htmlFor={`destination-${index}`}>Destination</Label>
                    <Input
                      id={`destination-${index}`}
                      value={segment.destination}
                      onChange={(e) => updateSegment(index, "destination", e.target.value.toUpperCase())}
                      placeholder="LHR"
                      maxLength={3}
                      required
                    />
                  </div>

                  <div className="md:col-span-4">
                    <Label htmlFor={`date-${index}`}>Departure Date</Label>
                    <Input
                      id={`date-${index}`}
                      type="date"
                      value={segment.date}
                      onChange={(e) => updateSegment(index, "date", e.target.value)}
                      required
                    />
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSegment(index)}
                      disabled={segments.length <= 2}
                      aria-label={`Remove leg ${index + 1}`}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Search Combined Itinerary
            </Button>
          </form>
        </CardContent>
      </Card>

      {itinerary && (
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Itinerary Results</CardTitle>
              <div className="flex items-center gap-2">
                {itinerary.isOpenJaw && <Badge variant="secondary">Open-Jaw Trip</Badge>}
                <Badge className="text-base font-bold">${itinerary.totalPrice}</Badge>
              </div>
            </div>
            <CardDescription>
              Total estimated duration: {Math.round(itinerary.totalDuration / 60)} hours
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              {itinerary.segments.map((res: any, idx: number) => (
                <div key={idx} className="p-4 border rounded-lg bg-muted/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-medium">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span>{res.segment.origin}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span>{res.segment.destination}</span>
                      <span className="text-xs text-muted-foreground ml-2">({res.segment.date})</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-primary">
                        ${res.bestFlight ? res.bestFlight.price : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {res.bestFlight ? (
                    <div className="text-xs text-muted-foreground flex items-center justify-between pt-2 border-t">
                      <span>Flight: {res.bestFlight.flightNumber} ({res.bestFlight.airlineCode})</span>
                      <span>Duration: {res.bestFlight.duration}m</span>
                    </div>
                  ) : (
                    <div className="text-xs text-amber-600 pt-2 border-t">
                      No direct flight found for this leg on selected date.
                    </div>
                  )}
                </div>
              ))}
            </div>

            {itinerary.baggageAllowance && (
              <div className="p-3 bg-secondary/20 rounded-md text-xs text-muted-foreground">
                <strong>Baggage Policy:</strong> Check-in {itinerary.baggageAllowance.checkIn}{itinerary.baggageAllowance.currency}, Carry-on {itinerary.baggageAllowance.carryOn}{itinerary.baggageAllowance.currency}. {itinerary.baggageAllowance.note}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  }
