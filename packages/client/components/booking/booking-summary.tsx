"use client"

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Plane, Clock, Calendar, Users, Luggage, Shield, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface Flight {
  id: string
  airline: string
  logo: string
  flightNumber: string
  from: string
  to: string
  fromCity: string
  toCity: string
  departure: string
  arrival: string
  date: string
  duration: string
  stops: string
  price: string
  currency: string
  class: string
  aircraft: string
}

interface BookingSummaryProps {
  flight: Flight
  passengerCount: number
  selectedSeat?: {
    id: string
    price: number
  }
  className?: string
}

export function BookingSummary({ flight, passengerCount, selectedSeat, className }: BookingSummaryProps) {
  const baseFare = parseFloat(flight.price) * passengerCount
  const seatFare = selectedSeat?.price || 0
  const taxes = baseFare * 0.08
  const total = baseFare + seatFare + taxes

  return (
    <Card className={cn("overflow-hidden border-none shadow-xl", className)}>
      <CardHeader className="bg-primary text-primary-foreground p-6">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-2xl font-serif">Booking Summary</CardTitle>
            <p className="text-primary-foreground/80 mt-1">Review your flight details</p>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-none">
            {flight.class}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="p-6 space-y-6">
        {/* Flight Main Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center p-2">
              <img src={flight.logo} alt={flight.airline} className="w-full h-full object-contain" />
            </div>
            <div>
              <p className="font-bold text-lg">{flight.airline}</p>
              <p className="text-sm text-muted-foreground">{flight.flightNumber}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-serif font-bold text-xl">{flight.date}</p>
          </div>
        </div>

        <Separator />

        {/* Route Details */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-2xl font-bold">{flight.departure}</p>
            <p className="font-medium text-lg">{flight.from}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{flight.fromCity}</p>
          </div>
          
          <div className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-muted-foreground font-medium">{flight.duration}</span>
            <div className="w-full flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <div className="flex-1 h-px bg-border relative">
                <Plane className="h-4 w-4 text-primary absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-0.5" />
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
            </div>
            <span className="text-xs text-muted-foreground">{flight.stops}</span>
          </div>

          <div className="space-y-1 text-right">
            <p className="text-2xl font-bold">{flight.arrival}</p>
            <p className="font-medium text-lg">{flight.to}</p>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">{flight.toCity}</p>
          </div>
        </div>

        <Separator />

        {/* Breakdown */}
        <div className="space-y-3">
          <h4 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">Price Breakdown</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Base Fare ({passengerCount} × ${flight.price})
              </span>
              <span className="font-medium">${baseFare.toFixed(2)}</span>
            </div>
            {selectedSeat && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Armchair className="h-4 w-4" />
                  Seat Selection ({selectedSeat.id})
                </span>
                <span className="font-medium">${seatFare.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Taxes & Mandatory Fees
              </span>
              <span className="font-medium">${taxes.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </CardContent>

      <CardFooter className="bg-muted/30 p-6 flex-col items-stretch gap-4">
        <div className="flex justify-between items-center">
          <span className="text-lg font-medium">Total Amount</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-primary">${total.toFixed(2)}</span>
            <p className="text-xs text-muted-foreground">≈ {(total * 10).toFixed(2)} XLM</p>
          </div>
        </div>
        
        <div className="flex items-start gap-2 p-3 bg-white/50 rounded-lg border border-border/50 text-[10px] text-muted-foreground">
          <Info className="h-3 w-3 shrink-0 text-primary mt-0.5" />
          <p>This transaction will be secured by a smart contract. No middleman fees apply. Refund policy: {flight.refundPolicy || "Standard carrier rules apply"}.</p>
        </div>
      </CardFooter>
    </Card>
  )
}

const Armchair = ({ className }: { className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width="24" 
    height="24" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3" />
    <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z" />
    <path d="M5 18v2" />
    <path d="M19 18v2" />
  </svg>
)
