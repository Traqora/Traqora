"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { MapPin, Calendar, Users, Search, ArrowUpDown, Plane } from "lucide-react"

const searchFormSchema = z.object({
  from: z.string().min(3, "Origin is required").max(3, "Use 3-letter airport code"),
  to: z.string().min(3, "Destination is required").max(3, "Use 3-letter airport code"),
  departure: z.string().min(1, "Departure date is required"),
  return: z.string().optional(),
  passengers: z.string().min(1, "Number of passengers is required"),
  class: z.enum(["economy", "premium_economy", "business", "first"]),
})

export type SearchFormData = z.infer<typeof searchFormSchema>

interface SearchFormProps {
  onSearch: (data: SearchFormData) => void
  isLoading?: boolean
  initialValues?: Partial<SearchFormData>
}

const popularAirports = [
  { code: "JFK", city: "New York", name: "John F. Kennedy International" },
  { code: "LAX", city: "Los Angeles", name: "Los Angeles International" },
  { code: "ORD", city: "Chicago", name: "O'Hare International" },
  { code: "MIA", city: "Miami", name: "Miami International" },
  { code: "SFO", city: "San Francisco", name: "San Francisco International" },
  { code: "LAS", city: "Las Vegas", name: "McCarran International" },
  { code: "SEA", city: "Seattle", name: "Seattle-Tacoma International" },
  { code: "DEN", city: "Denver", name: "Denver International" },
]

export function SearchForm({ onSearch, isLoading = false, initialValues }: SearchFormProps) {
  const [showFromSuggestions, setShowFromSuggestions] = useState(false)
  const [showToSuggestions, setShowToSuggestions] = useState(false)

  const form = useForm<SearchFormData>({
    resolver: zodResolver(searchFormSchema),
    defaultValues: {
      from: initialValues?.from || "",
      to: initialValues?.to || "",
      departure: initialValues?.departure || "",
      return: initialValues?.return || "",
      passengers: initialValues?.passengers || "1",
      class: initialValues?.class || "economy",
    },
  })

  const handleSubmit = (data: SearchFormData) => {
    onSearch(data)
  }

  const swapLocations = () => {
    const fromValue = form.getValues("from")
    const toValue = form.getValues("to")
    form.setValue("from", toValue)
    form.setValue("to", fromValue)
  }

  const selectAirport = (code: string, field: "from" | "to") => {
    form.setValue(field, code)
    if (field === "from") {
      setShowFromSuggestions(false)
    } else {
      setShowToSuggestions(false)
    }
  }

  const getTomorrowDate = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  }

  return (
    <Card className="shadow-lg border-0 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
              {/* From Field */}
              <FormField
                control={form.control}
                name="from"
                render={({ field }) => (
                  <FormItem className="relative">
                    <FormLabel className="text-sm font-medium">From</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          placeholder="JFK"
                          className="pl-10 uppercase"
                          maxLength={3}
                          onFocus={() => setShowFromSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowFromSuggestions(false), 200)}
                          onChange={(e) => {
                            field.onChange(e.target.value.toUpperCase())
                          }}
                        />
                        {showFromSuggestions && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                            {popularAirports
                              .filter(airport => 
                                airport.code.includes(field.value) || 
                                airport.city.toLowerCase().includes(field.value.toLowerCase())
                              )
                              .map((airport) => (
                                <button
                                  key={airport.code}
                                  type="button"
                                  className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm"
                                  onClick={() => selectAirport(airport.code, "from")}
                                >
                                  <div className="font-medium">{airport.code} - {airport.city}</div>
                                  <div className="text-xs text-muted-foreground">{airport.name}</div>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* To Field */}
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem className="relative">
                    <FormLabel className="text-sm font-medium">To</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          placeholder="LAX"
                          className="pl-10 uppercase"
                          maxLength={3}
                          onFocus={() => setShowToSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowToSuggestions(false), 200)}
                          onChange={(e) => {
                            field.onChange(e.target.value.toUpperCase())
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute -right-12 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-muted"
                          onClick={swapLocations}
                        >
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                        {showToSuggestions && (
                          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                            {popularAirports
                              .filter(airport => 
                                airport.code.includes(field.value) || 
                                airport.city.toLowerCase().includes(field.value.toLowerCase())
                              )
                              .map((airport) => (
                                <button
                                  key={airport.code}
                                  type="button"
                                  className="w-full px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground text-sm"
                                  onClick={() => selectAirport(airport.code, "to")}
                                >
                                  <div className="font-medium">{airport.code} - {airport.city}</div>
                                  <div className="text-xs text-muted-foreground">{airport.name}</div>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Departure Date */}
              <FormField
                control={form.control}
                name="departure"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Departure</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type="date"
                          min={getTomorrowDate()}
                          className="pl-10"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Return Date */}
              <FormField
                control={form.control}
                name="return"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Return (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          {...field}
                          type="date"
                          min={form.watch("departure") || getTomorrowDate()}
                          className="pl-10"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Passengers */}
              <FormField
                control={form.control}
                name="passengers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Passengers</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <Users className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 Passenger</SelectItem>
                        <SelectItem value="2">2 Passengers</SelectItem>
                        <SelectItem value="3">3 Passengers</SelectItem>
                        <SelectItem value="4">4 Passengers</SelectItem>
                        <SelectItem value="5">5 Passengers</SelectItem>
                        <SelectItem value="6">6 Passengers</SelectItem>
                        <SelectItem value="7">7 Passengers</SelectItem>
                        <SelectItem value="8">8 Passengers</SelectItem>
                        <SelectItem value="9">9 Passengers</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Search Button */}
              <Button 
                type="submit" 
                size="lg" 
                className="h-12 w-full sm:w-auto" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground mr-2"></div>
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search Flights
                  </>
                )}
              </Button>
            </div>

            {/* Class Selection */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <FormField
                control={form.control}
                name="class"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Cabin Class</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full sm:w-48">
                          <Plane className="h-4 w-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="economy">Economy</SelectItem>
                        <SelectItem value="premium_economy">Premium Economy</SelectItem>
                        <SelectItem value="business">Business</SelectItem>
                        <SelectItem value="first">First Class</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}