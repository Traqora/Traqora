"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Plane,
  Wallet,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Download,
  RefreshCw,
  Coins,
  Calendar,
  MapPin,
  QrCode,
  Copy,
  TrendingUp,
} from "lucide-react"

// Mock user data
const mockUser = {
  address: "0x1234567890abcdef1234567890abcdef12345678",
  balance: {
    eth: "2.45",
    usdc: "1,250.00",
    trq: "850",
  },
  totalBookings: 12,
  totalSpent: "5,420",
  loyaltyTier: "Silver",
}

// Mock bookings data
const mockBookings = [
  {
    id: "0x12345678",
    flightNumber: "DL 1234",
    airline: "Delta Airlines",
    logo: "/delta-airlines-logo.png",
    from: "JFK",
    to: "LAX",
    fromCity: "New York",
    toCity: "Los Angeles",
    date: "2024-12-15",
    departure: "08:30",
    arrival: "11:45",
    status: "confirmed",
    price: "450",
    currency: "USDC",
    transactionHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    refundEligible: true,
    refundDeadline: "2024-12-14T08:30:00Z",
    trqEarned: "45",
  },
  {
    id: "0x87654321",
    flightNumber: "AA 5678",
    airline: "American Airlines",
    logo: "/american-airlines-logo.png",
    from: "LAX",
    to: "JFK",
    fromCity: "Los Angeles",
    toCity: "New York",
    date: "2024-11-20",
    departure: "14:20",
    arrival: "22:55",
    status: "completed",
    price: "425",
    currency: "USDC",
    transactionHash: "0x87654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba09",
    refundEligible: false,
    refundDeadline: null,
    trqEarned: "42",
  },
  {
    id: "0xabcdef12",
    flightNumber: "UA 9012",
    airline: "United Airlines",
    logo: "/united-airlines-logo.png",
    from: "SFO",
    to: "ORD",
    fromCity: "San Francisco",
    toCity: "Chicago",
    date: "2024-10-05",
    departure: "19:15",
    arrival: "01:30",
    status: "refunded",
    price: "380",
    currency: "ETH",
    transactionHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    refundEligible: false,
    refundDeadline: null,
    trqEarned: "38",
  },
]

const getStatusColor = (status: string) => {
  switch (status) {
    case "confirmed":
      return "bg-secondary text-secondary-foreground"
    case "completed":
      return "bg-primary text-primary-foreground"
    case "refunded":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-muted text-muted-foreground"
  }
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "confirmed":
      return <CheckCircle className="h-4 w-4" />
    case "completed":
      return <Plane className="h-4 w-4" />
    case "refunded":
      return <RefreshCw className="h-4 w-4" />
    default:
      return <AlertCircle className="h-4 w-4" />
  }
}

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("bookings")

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  const formatTransactionHash = (hash: string) => {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`
  }

  const getRefundCountdown = (deadline: string) => {
    const now = new Date()
    const deadlineDate = new Date(deadline)
    const diff = deadlineDate.getTime() - now.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))

    if (hours <= 0) return "Expired"
    if (hours < 24) return `${hours}h remaining`

    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h remaining`
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
            <div className="hidden md:flex items-center space-x-8">
              <a href="/" className="text-muted-foreground hover:text-foreground transition-colors">
                Home
              </a>
              <a href="/search" className="text-muted-foreground hover:text-foreground transition-colors">
                Search Flights
              </a>
              <Link href="/governance" className="text-muted-foreground hover:text-foreground transition-colors">
                Governance
              </Link>
              <Badge variant="secondary" className="px-3 py-1">
                <CheckCircle className="h-4 w-4 mr-2 text-secondary" />
                Freighter Connected
              </Badge>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">My Dashboard</h1>
          <p className="text-muted-foreground">Manage your bookings, track refunds, and view your travel history</p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Bookings</p>
                  <p className="text-2xl font-bold">{mockUser.totalBookings}</p>
                </div>
                <Plane className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Spent</p>
                  <p className="text-2xl font-bold">${mockUser.totalSpent}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-secondary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">TRQ Tokens</p>
                  <p className="text-2xl font-bold">{mockUser.balance.trq}</p>
                </div>
                <Coins className="h-8 w-8 text-accent" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Loyalty Tier</p>
                  <p className="text-2xl font-bold">{mockUser.loyaltyTier}</p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  TIER
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="bookings">My Bookings</TabsTrigger>
            <TabsTrigger value="refunds">Refund Status</TabsTrigger>
            <TabsTrigger value="wallet">Wallet</TabsTrigger>
            <TabsTrigger value="loyalty">Loyalty Program</TabsTrigger>
          </TabsList>

          {/* Bookings Tab */}
          <TabsContent value="bookings" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-serif font-bold text-xl">Flight Bookings</h2>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export History
              </Button>
            </div>

            <div className="space-y-4">
              {mockBookings.map((booking) => (
                <Card key={booking.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      {/* Flight Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-4">
                          <img
                            src={booking.logo || "/placeholder.svg"}
                            alt={`${booking.airline} logo`}
                            className="w-10 h-10 rounded-lg"
                          />
                          <div>
                            <h3 className="font-semibold text-foreground">{booking.airline}</h3>
                            <p className="text-sm text-muted-foreground">{booking.flightNumber}</p>
                          </div>
                          <Badge className={getStatusColor(booking.status)}>
                            {getStatusIcon(booking.status)}
                            <span className="ml-1 capitalize">{booking.status}</span>
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                {booking.from} → {booking.to}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {booking.fromCity} to {booking.toCity}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{booking.date}</p>
                              <p className="text-sm text-muted-foreground">
                                {booking.departure} - {booking.arrival}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <Coins className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="font-medium">
                                {booking.price} {booking.currency}
                              </p>
                              <p className="text-sm text-muted-foreground">+{booking.trqEarned} TRQ earned</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2 lg:min-w-[200px]">
                        <Button variant="outline" size="sm" className="justify-start bg-transparent">
                          <QrCode className="h-4 w-4 mr-2" />
                          View Ticket
                        </Button>
                        <Button variant="outline" size="sm" className="justify-start bg-transparent">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View on Stellar Expert
                        </Button>
                        {booking.refundEligible && (
                          <Button variant="outline" size="sm" className="justify-start text-secondary bg-transparent">
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Request Refund
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Transaction Details */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Booking ID:</span>
                          <span className="font-mono">{booking.id}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(booking.id)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Transaction:</span>
                          <span className="font-mono">{formatTransactionHash(booking.transactionHash)}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(booking.transactionHash)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Refunds Tab */}
          <TabsContent value="refunds" className="space-y-6">
            <h2 className="font-serif font-bold text-xl">Refund Status</h2>

            <div className="space-y-4">
              {mockBookings
                .filter((booking) => booking.refundEligible || booking.status === "refunded")
                .map((booking) => (
                  <Card key={booking.id}>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <img
                            src={booking.logo || "/placeholder.svg"}
                            alt={`${booking.airline} logo`}
                            className="w-8 h-8 rounded-lg"
                          />
                          <div>
                            <h3 className="font-semibold">{booking.flightNumber}</h3>
                            <p className="text-sm text-muted-foreground">
                              {booking.from} → {booking.to} • {booking.date}
                            </p>
                          </div>
                        </div>
                        <Badge className={getStatusColor(booking.status)}>
                          {booking.status === "refunded" ? "Refunded" : "Eligible"}
                        </Badge>
                      </div>

                      {booking.status === "refunded" ? (
                        <Alert>
                          <CheckCircle className="h-4 w-4" />
                          <AlertDescription>
                            Refund of {booking.price} {booking.currency} was automatically processed and sent to your
                            wallet.
                          </AlertDescription>
                        </Alert>
                      ) : booking.refundEligible && booking.refundDeadline ? (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Refund deadline:</span>
                            <span className="text-sm font-medium">{getRefundCountdown(booking.refundDeadline)}</span>
                          </div>
                          <Progress value={75} className="h-2" />
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1">
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Request Refund
                            </Button>
                            <Button variant="outline" size="sm">
                              View Policy
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
            </div>
          </TabsContent>

          {/* Wallet Tab */}
          <TabsContent value="wallet" className="space-y-6">
            <h2 className="font-serif font-bold text-xl">Wallet Information</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Wallet Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" />
                    Connected Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <p className="font-medium">Freighter Wallet</p>
                      <p className="text-sm text-muted-foreground font-mono">{formatAddress(mockUser.address)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(mockUser.address)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Network</span>
                      <Badge variant="secondary">Stellar Mainnet</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="secondary" className="text-secondary">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Connected
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Balances */}
              <Card>
                <CardHeader>
                  <CardTitle>Token Balances</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-primary">ETH</span>
                        </div>
                        <span className="font-medium">Ethereum</span>
                      </div>
                      <span className="font-bold">{mockUser.balance.eth} ETH</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-secondary/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-secondary">USDC</span>
                        </div>
                        <span className="font-medium">USD Coin</span>
                      </div>
                      <span className="font-bold">{mockUser.balance.usdc} USDC</span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center">
                          <span className="text-xs font-bold text-accent">TRQ</span>
                        </div>
                        <span className="font-medium">Traqora Token</span>
                      </div>
                      <span className="font-bold">{mockUser.balance.trq} TRQ</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Loyalty Tab */}
          <TabsContent value="loyalty" className="space-y-6">
            <h2 className="font-serif font-bold text-xl">Loyalty Program</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Current Tier */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coins className="h-5 w-5" />
                    Current Tier: {mockUser.loyaltyTier}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress to Gold</span>
                      <span>850 / 1000 TRQ</span>
                    </div>
                    <Progress value={85} className="h-2" />
                    <p className="text-sm text-muted-foreground">150 more TRQ tokens needed for Gold tier</p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Silver Tier Benefits</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• 5% bonus TRQ on all bookings</li>
                      <li>• Priority customer support</li>
                      <li>• Extended refund window (48 hours)</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {/* TRQ Earnings */}
              <Card>
                <CardHeader>
                  <CardTitle>TRQ Token Earnings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-center p-4 bg-accent/10 rounded-lg">
                    <p className="text-2xl font-bold text-accent">{mockUser.balance.trq}</p>
                    <p className="text-sm text-muted-foreground">Total TRQ Earned</p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Recent Earnings</h4>
                    {mockBookings.slice(0, 3).map((booking) => (
                      <div key={booking.id} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{booking.flightNumber}</span>
                        <span className="font-medium text-accent">+{booking.trqEarned} TRQ</span>
                      </div>
                    ))}
                  </div>

                  <Button variant="outline" className="w-full bg-transparent">
                    <Coins className="h-4 w-4 mr-2" />
                    View All Earnings
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Governance */}
            <Card>
              <CardHeader>
                <CardTitle>DAO Governance</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Use your TRQ tokens to participate in Traqora governance decisions
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Voting Power</p>
                    <p className="text-sm text-muted-foreground">{mockUser.balance.trq} TRQ tokens</p>
                  </div>
                  <Link href="/governance">
                    <Button variant="outline">View Proposals</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
