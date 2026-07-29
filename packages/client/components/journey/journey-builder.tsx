"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  MapPin,
  Plus,
  Trash2,
  Sparkles,
  Calendar,
  Share2,
  Clock,
  Globe,
  ArrowRight,
  CheckCircle2,
  Copy,
} from "lucide-react"
import { toast } from "sonner"
import { apiClient } from "@/lib/api"

export interface JourneyStopItem {
  id?: string
  city: string
  airportCode: string
  arrivalDate: string
  departureDate: string
  timezone?: string
  activities: string[]
  notes?: string
}

export function JourneyBuilder() {
  const [journeyTitle, setJourneyTitle] = useState("My Multi-Stop Adventure")
  const [description, setDescription] = useState("Custom travel itinerary across multiple destinations")
  const [stops, setStops] = useState<JourneyStopItem[]>([
    {
      city: "New York",
      airportCode: "JFK",
      arrivalDate: "2026-09-01T10:00:00",
      departureDate: "2026-09-04T12:00:00",
      timezone: "America/New_York",
      activities: ["Central Park Tour", "Empire State Building"],
    },
    {
      city: "London",
      airportCode: "LHR",
      arrivalDate: "2026-09-05T08:00:00",
      departureDate: "2026-09-08T15:00:00",
      timezone: "Europe/London",
      activities: ["British Museum", "London Eye"],
    },
    {
      city: "Paris",
      airportCode: "CDG",
      arrivalDate: "2026-09-08T18:00:00",
      departureDate: "2026-09-12T11:00:00",
      timezone: "Europe/Paris",
      activities: ["Eiffel Tower", "Louvre Museum"],
    },
  ])

  const [templates, setTemplates] = useState<any[]>([])
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [optimizationStats, setOptimizationStats] = useState<string | null>(null)
  const [savedJourneyId, setSavedJourneyId] = useState<string | null>(null)
  const [shareToken, setShareToken] = useState<string | null>(null)

  const loadTemplates = useCallback(async () => {
    const res = await apiClient.getJourneyTemplates()
    if (res.success && Array.isArray(res.data)) {
      setTemplates(res.data)
    }
  }, [])

  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  const addStop = () => {
    setStops([
      ...stops,
      {
        city: "",
        airportCode: "",
        arrivalDate: new Date().toISOString().slice(0, 16),
        departureDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16),
        activities: [],
      },
    ])
  }

  const removeStop = (index: number) => {
    if (stops.length <= 2) {
      toast.error("Multi-stop journey requires at least 2 stops")
      return
    }
    setStops(stops.filter((_, idx) => idx !== index))
  }

  const updateStop = (index: number, field: keyof JourneyStopItem, value: any) => {
    const next = [...stops]
    next[index] = { ...next[index], [field]: value }
    setStops(next)
  }

  const handleOptimizeRoute = async () => {
    setIsOptimizing(true)
    const res = await apiClient.optimizeJourney(stops)
    if (res.success) {
      setStops(res.data.optimizedStops || stops)
      setOptimizationStats(
        `Optimized! Est. flight time: ${Math.round(res.data.totalFlightDurationMinutes / 60)}h. ${res.data.savingsDescription}`
      )
      toast.success("Route optimized successfully!")
    } else {
      toast.error(res.error?.message || "Failed to optimize route")
    }
    setIsOptimizing(false)
  }

  const handleSaveJourney = async () => {
    setIsSaving(true)
    const res = await apiClient.createJourney({
      title: journeyTitle,
      description,
      stops,
      isPublic: true,
    })
    if (res.success) {
      setSavedJourneyId(res.data.id)
      setShareToken(res.data.shareToken)
      toast.success("Journey saved successfully!")
    } else {
      toast.error(res.error?.message || "Failed to save journey")
    }
    setIsSaving(false)
  }

  const handleExportIcs = () => {
    if (!savedJourneyId) {
      toast.error("Please save the journey first before exporting to calendar")
      return
    }
    window.open(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/journeys/${savedJourneyId}/export.ics`, '_blank')
  }

  const applyTemplate = (template: any) => {
    setJourneyTitle(template.name)
    setDescription(template.description)
    setStops(
      template.stops.map((s: any) => ({
        city: s.city,
        airportCode: s.airportCode,
        arrivalDate: s.arrivalDate || new Date().toISOString().slice(0, 16),
        departureDate: s.departureDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 16),
        timezone: s.timezone,
        activities: s.activities || [],
      }))
    )
    toast.success(`Applied "${template.name}" template`)
  }

  return (
    <div className="space-y-8">
      {/* Header & Meta */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-serif flex items-center gap-2">
                <Globe className="h-6 w-6 text-primary" />
                Multi-Stop Journey Planner
              </CardTitle>
              <CardDescription>
                Build complex multi-city trips with route optimization, timezone management, and calendar integration.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleOptimizeRoute}
                disabled={isOptimizing}
              >
                <Sparkles className="h-4 w-4 text-amber-500" />
                {isOptimizing ? "Optimizing..." : "Optimize Route"}
              </Button>
              <Button onClick={handleSaveJourney} disabled={isSaving} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Journey"}
              </Button>
              {savedJourneyId && (
                <Button variant="secondary" onClick={handleExportIcs} className="gap-2">
                  <Calendar className="h-4 w-4" />
                  Export to Calendar (.ics)
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Trip Title</label>
              <Input value={journeyTitle} onChange={(e) => setJourneyTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>

          {optimizationStats && (
            <Alert className="bg-amber-500/10 border-amber-500/30">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm font-medium">
                {optimizationStats}
              </AlertDescription>
            </Alert>
          )}

          {shareToken && (
            <Alert className="bg-primary/10 border-primary/30">
              <Share2 className="h-4 w-4 text-primary" />
              <AlertDescription className="flex items-center justify-between text-xs">
                <span>Share Token: <code className="font-mono">{shareToken}</code></span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(shareToken)
                    toast.success("Share token copied to clipboard")
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Templates Selector */}
      {templates.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Pre-built Trip Templates
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                className="cursor-pointer hover:border-primary transition-all shadow-sm"
                onClick={() => applyTemplate(tpl)}
              >
                <CardHeader className="p-4 pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base font-bold">{tpl.name}</CardTitle>
                    <Badge variant="outline">{tpl.category}</Badge>
                  </div>
                  <CardDescription className="text-xs">{tpl.description}</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 text-xs text-muted-foreground flex items-center justify-between">
                  <span>{tpl.stops.length} Stops ({tpl.recommendedDays} days)</span>
                  <span className="text-primary font-medium flex items-center gap-1">
                    Apply Template <ArrowRight className="h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Stops List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" /> Multi-City Stops ({stops.length})
          </h3>
          <Button variant="outline" size="sm" onClick={addStop} className="gap-1">
            <Plus className="h-4 w-4" /> Add Stop
          </Button>
        </div>

        <div className="space-y-4">
          {stops.map((stop, idx) => (
            <Card key={idx} className="relative shadow-sm border-l-4 border-l-primary">
              <CardContent className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      Stop {idx + 1}
                    </Badge>
                    <span className="font-semibold text-lg">{stop.city || "New Destination"}</span>
                    {stop.airportCode && (
                      <Badge variant="outline" className="font-mono uppercase">
                        {stop.airportCode}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => removeStop(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">City</label>
                    <Input
                      placeholder="e.g. Paris"
                      value={stop.city}
                      onChange={(e) => updateStop(idx, "city", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">Airport Code</label>
                    <Input
                      placeholder="e.g. CDG"
                      maxLength={4}
                      className="uppercase font-mono"
                      value={stop.airportCode}
                      onChange={(e) => updateStop(idx, "airportCode", e.target.value.toUpperCase())}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">Arrival Date</label>
                    <Input
                      type="datetime-local"
                      value={stop.arrivalDate ? stop.arrivalDate.slice(0, 16) : ""}
                      onChange={(e) => updateStop(idx, "arrivalDate", e.target.value)}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium">Departure Date</label>
                    <Input
                      type="datetime-local"
                      value={stop.departureDate ? stop.departureDate.slice(0, 16) : ""}
                      onChange={(e) => updateStop(idx, "departureDate", e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Timezone: {stop.timezone || "Auto-detected"}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
