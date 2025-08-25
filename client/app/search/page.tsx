"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { MobileNav } from "@/components/mobile-nav"
import { FlightCardSkeleton } from "@/components/loading-skeleton"
import {
  Plane,
  Search,
  MapPin,
  Calendar,
  Users,
  Clock,
  ArrowRight,
  Filter,
  SortAsc,
  Wallet,
  ArrowUpDown,
  Star,
  Zap,
} from "lucide-react"

// Mock flight data
const mockFlights = [
  {
    id: "1",
    airline: "Delta Airlines",
    logo: "/delta-airlines-logo.png",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure: "08:30",
    arrival: "11:45",
    duration: "6h 15m",
    stops: "Non-stop",
    price: "450",
    currency: "USDC",
    class: "Economy",
  },
  {
    id: "2",
    airline: "American Airlines",
    logo: "/american-airlines-logo.png",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure: "14:20",
    arrival: "17:55",
    duration: "6h 35m",
    stops: "Non-stop",
    price: "425",
    currency: "USDC",
    class: "Economy",
  },
  {
    id: "3",
    airline: "United Airlines",
    logo: "/united-airlines-logo.png",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure: "19:15",
    arrival: "22:30",
    duration: "6h 15m",
    stops: "Non-stop",
    price: "380",
    currency: "ETH",
    class: "Economy",
  },
  {
    id: "4",
    airline: "JetBlue Airways",
    logo: "/jetblue-airways-logo.png",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure: "06:45",
    arrival: "12:20",
    duration: "8h 35m",
    stops: "1 stop in Denver",
    price: "320",
    currency: "USDC",
    class: "Economy",
  },
]

export default function SearchPage() {
  const [searchParams, setSearchParams] = useState({
    from: "New York (JFK)",
    to: "Los Angeles (LAX)",
    departure: "2024-12-15",
    return: "",
    passengers: "1",
    class: "economy",
  })

  const [sortBy, setSortBy] = useState("price")
  const [showFilters, setShowFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSearch = () => {
    setIsLoading(true)
    // Simulate search delay
    setTimeout(() => setIsLoading(false), 1500)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
                <Plane className="h-6 w-6 text-primary-foreground" />
              </div>
              <span className="font-serif font-bold text-xl sm:text-2xl text-foreground">Traqora</span>
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="/" className="text-muted-foreground hover:text-foreground transition-colors font-medium">
                Home
              </a>
              <a
                href="/dashboard"
                className="text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                My Bookings
              </a>
              <Button
                variant="outline"
                size="sm"
                className="bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80"
              >
                <Wallet className="h-4 w-4 mr-2" />
                Connect Wallet
              </Button>
            </div>

            {/* Mobile Navigation */}
            <MobileNav />
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Search Form */}
        <Card className="mb-8 shadow-xl border-0 bg-background/60 backdrop-blur-xl">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="font-serif font-bold text-2xl sm:text-3xl text-foreground mb-2">
                Find Your Perfect Flight
              </h1>
              <p className="text-muted-foreground">Search and compare flights with zero platform fees</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
              <div className="space-y-2">
                <Label htmlFor="from" className="text-sm font-semibold text-foreground">
                  From
                </Label>
                <div className="relative group">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="from"
                    placeholder="Departure city"
                    value={searchParams.from}
                    onChange={(e) => setSearchParams({ ...searchParams, from: e.target.value })}
                    className="pl-10 h-12 bg-background/50 border-border/50 focus:bg-background focus:border-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="to" className="text-sm font-semibold text-foreground">
                  To
                </Label>
                <div className="relative group">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="to"
                    placeholder="Destination city"
                    value={searchParams.to}
                    onChange={(e) => setSearchParams({ ...searchParams, to: e.target.value })}
                    className="pl-10 h-12 bg-background/50 border-border/50 focus:bg-background focus:border-primary/50 transition-all"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-2 h-8 w-8 p-0 hover:bg-muted/50"
                    onClick={() => {
                      const temp = searchParams.from
                      setSearchParams({ ...searchParams, from: searchParams.to, to: temp })
                    }}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="departure" className="text-sm font-semibold text-foreground">
                  Departure
                </Label>
                <div className="relative group">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="departure"
                    type="date"
                    value={searchParams.departure}
                    onChange={(e) => setSearchParams({ ...searchParams, departure: e.target.value })}
                    className="pl-10 h-12 bg-background/50 border-border/50 focus:bg-background focus:border-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="return" className="text-sm font-semibold text-foreground">
                  Return (Optional)
                </Label>
                <div className="relative group">
                  <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    id="return"
                    type="date"
                    value={searchParams.return}
                    onChange={(e) => setSearchParams({ ...searchParams, return: e.target.value })}
                    className="pl-10 h-12 bg-background/50 border-border/50 focus:bg-background focus:border-primary/50 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="passengers" className="text-sm font-semibold text-foreground">
                  Passengers
                </Label>
                <Select
                  value={searchParams.passengers}
                  onValueChange={(value) => setSearchParams({ ...searchParams, passengers: value })}
                >
                  <SelectTrigger className="h-12 bg-background/50 border-border/50 focus:bg-background focus:border-primary/50">
                    <Users className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Passenger</SelectItem>
                    <SelectItem value="2">2 Passengers</SelectItem>
                    <SelectItem value="3">3 Passengers</SelectItem>
                    <SelectItem value="4">4+ Passengers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                size="lg"
                className="h-12 w-full sm:w-auto bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 shadow-lg hover:shadow-xl transition-all duration-300"
                onClick={handleSearch}
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

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-6">
              <Select
                value={searchParams.class}
                onValueChange={(value) => setSearchParams({ ...searchParams, class: value })}
              >
                <SelectTrigger className="w-full sm:w-48 bg-background/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="premium">Premium Economy</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="first">First Class</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-4 w-4 text-secondary" />
                <span>Instant booking with smart contracts</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="font-serif font-bold text-2xl sm:text-3xl text-foreground mb-1">Available Flights</h2>
            <p className="text-muted-foreground">
              {isLoading
                ? "Searching for the best deals..."
                : `${mockFlights.length} flights found for ${searchParams.from} → ${searchParams.to}`}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="w-full sm:w-auto bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-48 bg-background/50 border-border/50">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price">Price (Low to High)</SelectItem>
                <SelectItem value="duration">Duration</SelectItem>
                <SelectItem value="departure">Departure Time</SelectItem>
                <SelectItem value="airline">Airline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <Card className="mb-6 shadow-lg border-0 bg-background/60 backdrop-blur-xl">
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <Label className="text-sm font-semibold mb-3 block text-foreground">Price Range</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Input placeholder="Min" className="text-sm bg-background/50 border-border/50" />
                      <span className="text-muted-foreground">-</span>
                      <Input placeholder="Max" className="text-sm bg-background/50 border-border/50" />
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-3 block text-foreground">Departure Time</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      Morning (6AM - 12PM)
                    </Badge>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      Afternoon (12PM - 6PM)
                    </Badge>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      Evening (6PM - 12AM)
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-3 block text-foreground">Airlines</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      Delta Airlines
                    </Badge>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      American Airlines
                    </Badge>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      United Airlines
                    </Badge>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold mb-3 block text-foreground">Stops</Label>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      Non-stop
                    </Badge>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      1 Stop
                    </Badge>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-all"
                    >
                      2+ Stops
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Flight Results */}
        <div className="space-y-4">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => <FlightCardSkeleton key={i} />)
            : mockFlights.map((flight, index) => (
                <Card
                  key={flight.id}
                  className="group hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 border-0 bg-background/60 backdrop-blur-xl overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <CardContent className="relative p-6 sm:p-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      {/* Flight Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-6">
                          <div className="relative">
                            <img
                              src={flight.logo || "/placeholder.svg"}
                              alt={`${flight.airline} logo`}
                              className="w-12 h-12 rounded-xl shadow-md"
                            />
                            {index === 0 && (
                              <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-secondary to-primary rounded-full flex items-center justify-center">
                                <Star className="h-3 w-3 text-white" />
                              </div>
                            )}
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-foreground">{flight.airline}</h3>
                            <p className="text-sm text-muted-foreground">{flight.class}</p>
                          </div>
                          {index === 0 && (
                            <Badge className="bg-gradient-to-r from-secondary to-primary text-white border-0">
                              Best Deal
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-4 sm:gap-8">
                          <div className="text-center min-w-0 flex-shrink-0">
                            <p className="font-bold text-2xl text-foreground">{flight.departure}</p>
                            <p className="text-base font-semibold text-muted-foreground">{flight.from}</p>
                            <p className="text-sm text-muted-foreground truncate">{flight.fromCity}</p>
                          </div>

                          <div className="flex-1 flex items-center justify-center min-w-0 relative">
                            <div className="flex items-center gap-2 text-muted-foreground w-full">
                              <div className="w-3 h-3 bg-gradient-to-r from-primary to-secondary rounded-full flex-shrink-0"></div>
                              <div className="flex-1 h-0.5 bg-gradient-to-r from-primary/20 to-secondary/20"></div>
                              <div className="bg-gradient-to-r from-primary to-secondary p-2 rounded-full">
                                <Plane className="h-4 w-4 text-white" />
                              </div>
                              <div className="flex-1 h-0.5 bg-gradient-to-r from-secondary/20 to-primary/20"></div>
                              <div className="w-3 h-3 bg-gradient-to-r from-secondary to-primary rounded-full flex-shrink-0"></div>
                            </div>
                          </div>

                          <div className="text-center min-w-0 flex-shrink-0">
                            <p className="font-bold text-2xl text-foreground">{flight.arrival}</p>
                            <p className="text-base font-semibold text-muted-foreground">{flight.to}</p>
                            <p className="text-sm text-muted-foreground truncate">{flight.toCity}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 sm:gap-6 mt-6 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="h-4 w-4 flex-shrink-0" />
                            <span className="font-medium">{flight.duration}</span>
                          </div>
                          <div className="text-muted-foreground font-medium">{flight.stops}</div>
                          <Badge variant="secondary" className="bg-secondary/10 text-secondary border-secondary/20">
                            Auto-refund
                          </Badge>
                        </div>
                      </div>

                      <Separator orientation="vertical" className="hidden lg:block h-32 bg-border/50" />

                      {/* Price and Book */}
                      <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-4 lg:min-w-[220px]">
                        <div className="text-left lg:text-right">
                          <p className="text-3xl font-bold text-foreground mb-1">
                            {flight.price} <span className="text-lg text-muted-foreground">{flight.currency}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mb-2">per person</p>
                          <div className="flex lg:justify-end gap-2">
                            <Badge variant="outline" className="text-xs border-secondary/30 text-secondary">
                              <Zap className="h-3 w-3 mr-1" />
                              Instant
                            </Badge>
                          </div>
                        </div>

                        <Button
                          size="lg"
                          className="px-8 w-full sm:w-auto bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 shadow-lg hover:shadow-xl transition-all duration-300 group-hover:scale-105"
                          asChild
                        >
                          <a href={`/book/${flight.id}`}>
                            Book Now
                            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
        </div>

        {/* Load More */}
        {!isLoading && (
          <div className="text-center mt-12">
            <Button
              variant="outline"
              size="lg"
              className="bg-background/50 backdrop-blur-sm border-border/50 hover:bg-background/80 px-8"
            >
              Load More Flights
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
