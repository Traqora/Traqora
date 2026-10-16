"use client"

import { useState } from "react"
import { Calendar, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface DateFlexSearchProps {
  defaultFrom?: string
  defaultTo?: string
  defaultDate?: string
  onSearch: (payload: { from: string; to: string; date: string; flexDays: number; passengers: number; cabinClass: string }) => void
}

export function DateFlexSearch({ defaultFrom = "JFK", defaultTo = "LAX", defaultDate, onSearch }: DateFlexSearchProps) {
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [date, setDate] = useState(defaultDate || new Date().toISOString().slice(0, 10))
  const [flexDays, setFlexDays] = useState<number>(3)
  const [passengers, setPassengers] = useState<number>(1)
  const [cabinClass, setCabinClass] = useState<string>("economy")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedFrom = from.trim().toUpperCase()
    const trimmedTo = to.trim().toUpperCase()

    if (!trimmedFrom || !trimmedTo) {
      setError("Origin and destination airports are required.")
      return
    }
    if (trimmedFrom === trimmedTo) {
      setError("Origin and destination cannot be the same airport.")
      return
    }
    if (!date) {
      setError("Please select a departure date.")
      return
    }

    const parsedDate = new Date(date)
    if (isNaN(parsedDate.getTime())) {
      setError("Invalid departure date format.")
      return
    }

    onSearch({
      from: trimmedFrom,
      to: trimmedTo,
      date,
      flexDays,
      passengers,
      cabinClass,
    })
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          Flexible Date Flight Search
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="flex-from">From</Label>
              <Input
                id="flex-from"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                placeholder="JFK"
                maxLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="flex-to">To</Label>
              <Input
                id="flex-to"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="LAX"
                maxLength={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="flex-date">Departure Date</Label>
              <Input
                id="flex-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="flex-range">Flexibility Window</Label>
              <Select value={String(flexDays)} onValueChange={(v) => setFlexDays(parseInt(v, 10))}>
                <SelectTrigger id="flex-range">
                  <SelectValue placeholder="Select flexibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">+/- 1 day</SelectItem>
                  <SelectItem value="3">+/- 3 days</SelectItem>
                  <SelectItem value="7">+/- 7 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-4">
              <div className="space-y-1">
                <Label htmlFor="flex-passengers">Passengers</Label>
                <Select value={String(passengers)} onValueChange={(v) => setPassengers(parseInt(v, 10))}>
                  <SelectTrigger id="flex-passengers" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="flex-class">Cabin Class</Label>
                <Select value={cabinClass} onValueChange={setCabinClass}>
                  <SelectTrigger id="flex-class" className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="economy">Economy</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="first">First</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full sm:w-auto mt-auto">
              Search Flexible Dates
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
