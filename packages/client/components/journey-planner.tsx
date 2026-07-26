"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MapPin, Plus, Trash2, Clock, Route } from "lucide-react"

interface JourneyStop {
  id: string
  airportCode: string
  city: string
  arrival: string
  departure: string
}

interface JourneyPlan {
  id: string
  stops: JourneyStop[]
  totalDurationMinutes: number
  optimized: boolean
}

export function JourneyPlanner() {
  const [stops, setStops] = useState<JourneyStop[]>([
    { id: "1", airportCode: "JFK", city: "New York", arrival: "2025-01-01T08:00:00Z", departure: "2025-01-01T09:00:00Z" },
  ])
  const [plan, setPlan] = useState<JourneyPlan | null>(null)
  const [loading, setLoading] = useState(false)

  const addStop = () => {
    setStops([
      ...stops,
      {
        id: `${Date.now()}`,
        airportCode: "",
        city: "",
        arrival: "",
        departure: "",
      },
    ])
  }

  const removeStop = (id: string) => {
    setStops(stops.filter((s) => s.id !== id))
  }

  const updateStop = (id: string, field: keyof JourneyStop, value: string) => {
    setStops(stops.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  const planJourney = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/v1/journeys/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops }),
      })

      if (!res.ok) throw new Error("Failed to plan journey")

      const data = await res.json()
      setPlan(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Route className="h-5 w-5 text-primary" />
          Journey Planner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          {stops.map((stop, index) => (
            <div key={stop.id} className="flex items-start gap-4 p-4 border rounded-xl">
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                  {index + 1}
                </div>
                {index < stops.length - 1 && <div className="w-px h-8 bg-border mt-2" />}
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`airport-${stop.id}`}>Airport Code</Label>
                  <Input
                    id={`airport-${stop.id}`}
                    value={stop.airportCode}
                    onChange={(e) => updateStop(stop.id, "airportCode", e.target.value.toUpperCase())}
                    placeholder="JFK"
                    maxLength={3}
                  />
                </div>
                <div>
                  <Label htmlFor={`city-${stop.id}`}>City</Label>
                  <Input
                    id={`city-${stop.id}`}
                    value={stop.city}
                    onChange={(e) => updateStop(stop.id, "city", e.target.value)}
                    placeholder="New York"
                  />
                </div>
                <div>
                  <Label htmlFor={`arrival-${stop.id}`}>Arrival</Label>
                  <Input
                    id={`arrival-${stop.id}`}
                    type="datetime-local"
                    value={stop.arrival ? stop.arrival.slice(0, 16) : ""}
                    onChange={(e) => updateStop(stop.id, "arrival", e.target.value ? new Date(e.target.value).toISOString() : "")}
                  />
                </div>
                <div>
                  <Label htmlFor={`departure-${stop.id}`}>Departure</Label>
                  <Input
                    id={`departure-${stop.id}`}
                    type="datetime-local"
                    value={stop.departure ? stop.departure.slice(0, 16) : ""}
                    onChange={(e) => updateStop(stop.id, "departure", e.target.value ? new Date(e.target.value).toISOString() : "")}
                  />
                </div>
              </div>
              {stops.length > 2 && (
                <Button variant="ghost" size="icon" onClick={() => removeStop(stop.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={addStop} className="flex-1">
            <Plus className="mr-2 h-4 w-4" />
            Add Stop
          </Button>
          <Button onClick={planJourney} disabled={loading || stops.length < 2} className="flex-1">
            {loading ? "Planning..." : "Plan Journey"}
          </Button>
        </div>

        {plan && (
          <>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg">Optimized Journey</h3>
                <Badge variant={plan.optimized ? "default" : "secondary"}>
                  {plan.optimized ? "Optimized" : "Original"}
                </Badge>
              </div>
              <div className="space-y-3">
                {plan.stops.map((stop, index) => (
                  <div key={stop.id} className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {stop.city} ({stop.airportCode})
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(stop.arrival).toLocaleString()} → {new Date(stop.departure).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Total duration: {formatDuration(plan.totalDurationMinutes)}</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
