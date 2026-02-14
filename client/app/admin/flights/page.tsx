"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  Plane,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  ArrowLeft,
  MapPin,
  Clock,
  DollarSign,
  Users,
  Calendar,
  Building,
} from "lucide-react"

// Mock flight data for admin management
const mockFlights = [
  {
    id: "FL001",
    flightNumber: "DL 1234",
    airline: "Delta Airlines",
    logo: "/delta-airlines-logo.png",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    departure: "08:30",
    arrival: "11:45",
    duration: "6h 15m",
    aircraft: "Boeing 737-800",
    price: 450,
    currency: "USDC",
    capacity: 180,
    booked: 142,
    status: "active",
    date: "2024-12-15",
  },
  {
    id: "FL002",
    flightNumber: "AA 5678",
    airline: "American Airlines",
    logo: "/american-airlines-logo.png",
    from: "LAX",
    to: "JFK",
    fromCity: "Los Angeles",
    toCity: "New York",
    departure: "14:20",
    arrival: "22:55",
    duration: "5h 35m",
    aircraft: "Airbus A321",
    price: 425,
    currency: "USDC",
    capacity: 190,
    booked: 156,
    status: "active",
    date: "2024-12-15",
  },
  {
    id: "FL003",
    flightNumber: "UA 9012",
    airline: "United Airlines",
    logo: "/united-airlines-logo.png",
    from: "ORD",
    to: "SFO",
    fromCity: "Chicago",
    toCity: "San Francisco",
    departure: "19:15",
    arrival: "21:30",
    duration: "4h 15m",
    aircraft: "Boeing 777-200",
    price: 380,
    currency: "ETH",
    capacity: 300,
    booked: 89,
    status: "cancelled",
    date: "2024-12-14",
  },
]

const airlines = [
  { code: "DL", name: "Delta Airlines", logo: "/delta-airlines-logo.png" },
  { code: "AA", name: "American Airlines", logo: "/american-airlines-logo.png" },
  { code: "UA", name: "United Airlines", logo: "/united-airlines-logo.png" },
  { code: "B6", name: "JetBlue Airways", logo: "/jetblue-airways-logo.png" },
]

export default function AdminFlightManagement() {
  const [flights, setFlights] = useState(mockFlights)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isAddFlightOpen, setIsAddFlightOpen] = useState(false)
  const [editingFlight, setEditingFlight] = useState(null)

  const [newFlight, setNewFlight] = useState({
    flightNumber: "",
    airline: "",
    from: "",
    to: "",
    fromCity: "",
    toCity: "",
    departure: "",
    arrival: "",
    aircraft: "",
    price: "",
    currency: "USDC",
    capacity: "",
    date: "",
  })

  const filteredFlights = flights.filter((flight) => {
    const matchesSearch =
      flight.flightNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flight.airline.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flight.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      flight.to.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || flight.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleAddFlight = () => {
    const flight = {
      id: `FL${String(flights.length + 1).padStart(3, "0")}`,
      ...newFlight,
      price: Number.parseFloat(newFlight.price),
      capacity: Number.parseInt(newFlight.capacity),
      booked: 0,
      status: "active",
      duration: "6h 15m", // This would be calculated
      logo: airlines.find((a) => a.name === newFlight.airline)?.logo || "/placeholder.svg",
    }

    setFlights([...flights, flight])
    setNewFlight({
      flightNumber: "",
      airline: "",
      from: "",
      to: "",
      fromCity: "",
      toCity: "",
      departure: "",
      arrival: "",
      aircraft: "",
      price: "",
      currency: "USDC",
      capacity: "",
      date: "",
    })
    setIsAddFlightOpen(false)
  }

  const handleStatusChange = (flightId, newStatus) => {
    setFlights(flights.map((flight) => (flight.id === flightId ? { ...flight, status: newStatus } : flight)))
  }

  const handleDeleteFlight = (flightId) => {
    setFlights(flights.filter((flight) => flight.id !== flightId))
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Navigation */}
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" size="sm" asChild>
                <a href="/admin">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </a>
              </Button>
              <div className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
                  <Plane className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-serif font-bold text-xl text-foreground">Flight Management</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Admin
                  </Badge>
                </div>
              </div>
            </div>

            <Dialog open={isAddFlightOpen} onOpenChange={setIsAddFlightOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-secondary">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Flight
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Flight</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="flightNumber">Flight Number</Label>
                    <Input
                      id="flightNumber"
                      placeholder="e.g., DL 1234"
                      value={newFlight.flightNumber}
                      onChange={(e) => setNewFlight({ ...newFlight, flightNumber: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="airline">Airline</Label>
                    <Select
                      value={newFlight.airline}
                      onValueChange={(value) => setNewFlight({ ...newFlight, airline: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select airline" />
                      </SelectTrigger>
                      <SelectContent>
                        {airlines.map((airline) => (
                          <SelectItem key={airline.code} value={airline.name}>
                            {airline.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="from">From (Airport Code)</Label>
                    <Input
                      id="from"
                      placeholder="e.g., JFK"
                      value={newFlight.from}
                      onChange={(e) => setNewFlight({ ...newFlight, from: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fromCity">From City</Label>
                    <Input
                      id="fromCity"
                      placeholder="e.g., New York"
                      value={newFlight.fromCity}
                      onChange={(e) => setNewFlight({ ...newFlight, fromCity: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="to">To (Airport Code)</Label>
                    <Input
                      id="to"
                      placeholder="e.g., LAX"
                      value={newFlight.to}
                      onChange={(e) => setNewFlight({ ...newFlight, to: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="toCity">To City</Label>
                    <Input
                      id="toCity"
                      placeholder="e.g., Los Angeles"
                      value={newFlight.toCity}
                      onChange={(e) => setNewFlight({ ...newFlight, toCity: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="departure">Departure Time</Label>
                    <Input
                      id="departure"
                      type="time"
                      value={newFlight.departure}
                      onChange={(e) => setNewFlight({ ...newFlight, departure: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="arrival">Arrival Time</Label>
                    <Input
                      id="arrival"
                      type="time"
                      value={newFlight.arrival}
                      onChange={(e) => setNewFlight({ ...newFlight, arrival: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date">Flight Date</Label>
                    <Input
                      id="date"
                      type="date"
                      value={newFlight.date}
                      onChange={(e) => setNewFlight({ ...newFlight, date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="aircraft">Aircraft</Label>
                    <Input
                      id="aircraft"
                      placeholder="e.g., Boeing 737-800"
                      value={newFlight.aircraft}
                      onChange={(e) => setNewFlight({ ...newFlight, aircraft: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      placeholder="450"
                      value={newFlight.price}
                      onChange={(e) => setNewFlight({ ...newFlight, price: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Select
                      value={newFlight.currency}
                      onValueChange={(value) => setNewFlight({ ...newFlight, currency: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USDC">USDC</SelectItem>
                        <SelectItem value="ETH">ETH</SelectItem>
                        <SelectItem value="XLM">XLM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="capacity">Capacity</Label>
                    <Input
                      id="capacity"
                      type="number"
                      placeholder="180"
                      value={newFlight.capacity}
                      onChange={(e) => setNewFlight({ ...newFlight, capacity: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-4">
                  <Button variant="outline" onClick={() => setIsAddFlightOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddFlight} className="bg-gradient-to-r from-primary to-secondary">
                    Add Flight
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Flight Management</h1>
          <p className="text-muted-foreground">Manage flights, airlines, and booking availability</p>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6 border-0 bg-background/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="search">Search Flights</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by flight number, airline, or route..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-background/50 border-border/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status Filter</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 bg-background/50 border-border/50">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Flight Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Plane className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Flights</p>
                  <p className="text-xl font-bold text-foreground">{flights.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <Building className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Flights</p>
                  <p className="text-xl font-bold text-foreground">
                    {flights.filter((f) => f.status === "active").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <Users className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Bookings</p>
                  <p className="text-xl font-bold text-foreground">{flights.reduce((sum, f) => sum + f.booked, 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg. Price</p>
                  <p className="text-xl font-bold text-foreground">
                    ${Math.round(flights.reduce((sum, f) => sum + f.price, 0) / flights.length)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Flight List */}
        <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle>Flight List ({filteredFlights.length} flights)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredFlights.map((flight) => (
                <div key={flight.id} className="p-6 bg-muted/20 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Flight Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <img
                          src={flight.logo || "/placeholder.svg"}
                          alt={`${flight.airline} logo`}
                          className="w-10 h-10 rounded-lg"
                        />
                        <div>
                          <h3 className="font-bold text-lg text-foreground">{flight.flightNumber}</h3>
                          <p className="text-sm text-muted-foreground">{flight.airline}</p>
                        </div>
                        <Badge
                          variant={
                            flight.status === "active"
                              ? "default"
                              : flight.status === "cancelled"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {flight.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {flight.from} → {flight.to}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {flight.departure} - {flight.arrival}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>{flight.date}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {flight.price} {flight.currency}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {flight.booked}/{flight.capacity} booked
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Plane className="h-4 w-4 text-muted-foreground" />
                          <span>{flight.aircraft}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Select value={flight.status} onValueChange={(value) => handleStatusChange(flight.id, value)}>
                        <SelectTrigger className="w-32 bg-background/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="delayed">Delayed</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button variant="outline" size="sm" className="bg-background/50">
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" className="bg-background/50">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-background/50 hover:bg-destructive/10 hover:border-destructive/50"
                        onClick={() => handleDeleteFlight(flight.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
