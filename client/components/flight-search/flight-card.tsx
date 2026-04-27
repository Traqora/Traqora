"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { 
  Plane, 
  Clock, 
  MapPin, 
  Star, 
  Wallet, 
  ArrowRight,
  Users,
  Zap
} from "lucide-react"
import Link from "next/link"

export interface Flight {
  id: string
  from: string
  to: string
  fromCity?: string
  toCity?: string
  departure_time: string
  arrival_time?: string
  airline: string
  airline_name?: string
  stops: number
  duration: number // in minutes
  price: number
  rating: number
  available_seats: number
  class: "economy" | "premium_economy" | "business" | "first"
  aircraft?: string
  amenities?: string[]
}

interface FlightCardProps {
  flight: Flight
  showXLMPrice?: boolean
  xlmRate?: number // USD to XLM conversion rate
}

const airlineNames: Record<string, string> = {
  "AA": "American Airlines",
  "DL": "Delta Air Lines", 
  "UA": "United Airlines",
  "B6": "JetBlue Airways",
  "WN": "Southwest Airlines",
  "AS": "Alaska Airlines",
  "F9": "Frontier Airlines",
  "NK": "Spirit Airlines",
}

const airlineLogos: Record<string, string> = {
  "AA": "/airlines/american.png",
  "DL": "/airlines/delta.png",
  "UA": "/airlines/united.png", 
  "B6": "/airlines/jetblue.png",
  "WN": "/airlines/southwest.png",
  "AS": "/airlines/alaska.png",
  "F9": "/airlines/frontier.png",
  "NK": "/airlines/spirit.png",
}

export function FlightCard({ flight, showXLMPrice = true, xlmRate = 0.12 }: FlightCardProps) {
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  const getStopsText = (stops: number) => {
    if (stops === 0) return "Non-stop"
    return `${stops} stop${stops > 1 ? "s" : ""}`
  }

  const getClassBadgeVariant = (flightClass: string) => {
    switch (flightClass) {
      case "first": return "default"
      case "business": return "secondary" 
      case "premium_economy": return "outline"
      default: return "outline"
    }
  }

  const getClassDisplayName = (flightClass: string) => {
    switch (flightClass) {
      case "premium_economy": return "Premium Economy"
      case "business": return "Business"
      case "first": return "First Class"
      default: return "Economy"
    }
  }

  const xlmPrice = flight.price / xlmRate
  const airlineName = airlineNames[flight.airline] || flight.airline_name || flight.airline
  const airlineLogo = airlineLogos[flight.airline]

  return (
    <Card className="hover:shadow-lg transition-shadow duration-200 border-0 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          {/* Airline Info */}
          <div className="flex items-center gap-3 lg:w-48">
            {airlineLogo && (
              <img 
                src={airlineLogo} 
                alt={`${airlineName} airline logo`}
                className="w-8 h-8 object-contain"
                aria-hidden="false"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            )}
            <div>
              <div className="font-medium text-sm">{airlineName}</div>
              <div className="text-xs text-muted-foreground">{flight.airline}</div>
            </div>
          </div>

          {/* Flight Route & Times */}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div className="text-center">
                <div className="text-2xl font-bold">{formatTime(flight.departure_time)}</div>
                <div className="text-sm text-muted-foreground">{flight.from}</div>
                {flight.fromCity && (
                  <div className="text-xs text-muted-foreground">{flight.fromCity}</div>
                )}
              </div>

              <div className="flex-1 px-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <div className="h-px bg-border flex-1"></div>
                  <Plane className="h-4 w-4 text-muted-foreground" />
                  <div className="h-px bg-border flex-1"></div>
                </div>
                <div className="text-center">
                  <div className="text-sm font-medium">{formatDuration(flight.duration)}</div>
                  <div className="text-xs text-muted-foreground">{getStopsText(flight.stops)}</div>
                </div>
              </div>

              <div className="text-center">
                <div className="text-2xl font-bold">
                  {flight.arrival_time ? formatTime(flight.arrival_time) : "--:--"}
                </div>
                <div className="text-sm text-muted-foreground">{flight.to}</div>
                {flight.toCity && (
                  <div className="text-xs text-muted-foreground">{flight.toCity}</div>
                )}
              </div>
            </div>
          </div>

          {/* Flight Details */}
          <div className="lg:w-32 space-y-2">
            <Badge variant={getClassBadgeVariant(flight.class)} className="w-full justify-center">
              {getClassDisplayName(flight.class)}
            </Badge>
            
            <div className="flex items-center justify-center gap-1 text-sm">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{flight.rating}</span>
            </div>

            <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{flight.available_seats} left</span>
            </div>
          </div>

          {/* Pricing */}
          <div className="lg:w-40 space-y-2">
            <div className="text-right">
              <div className="text-2xl font-bold">${flight.price}</div>
              <div className="text-sm text-muted-foreground">per person</div>
            </div>
            
            {showXLMPrice && (
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-sm font-medium text-primary">
                  <Wallet className="h-3 w-3" />
                  <span>{xlmPrice.toFixed(2)} XLM</span>
                </div>
              </div>
            )}

            <Link 
              href={`/book/${flight.id}`} 
              className="block"
              aria-label={`Book flight ${flight.flightNumber} from ${flight.from} to ${flight.to} for $${flight.price}`}
            >
              <Button className="w-full" size="sm">
                <Zap className="h-4 w-4 mr-1" />
                Book Now
              </Button>
            </Link>
          </div>
        </div>

        {/* Additional Info */}
        {(flight.aircraft || flight.amenities) && (
          <>
            <Separator className="my-4" />
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              {flight.aircraft && (
                <div className="flex items-center gap-1">
                  <Plane className="h-3 w-3" />
                  <span>{flight.aircraft}</span>
                </div>
              )}
              {flight.amenities && flight.amenities.length > 0 && (
                <div className="flex items-center gap-1">
                  <span>Amenities:</span>
                  <span>{flight.amenities.join(", ")}</span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}