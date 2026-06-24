"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Plane,
  Calendar,
  MapPin,
  TrendingUp,
  Leaf,
  BarChart3,
  PieChart,
  LineChart,
  Award,
  DollarSign,
} from "lucide-react"
import { PieChart as RePieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart as ReLineChart, Line } from 'recharts'
import { Separator } from '@/components/ui/separator'

interface BookingHistoryItem {
  id: string
  date: string
  route: string
  amount: number
  pointsEarned: number
  status: 'completed' | 'upcoming' | 'cancelled'
}

interface SpendingData {
  month: string
  amount: number
}

interface TravelStat {
  label: string
  value: number
  unit: string
}

interface CarbonFootprint {
  total: number
  offset: number
  monthly: { month: string; emissions: number; offset: number }[]
}

interface UserAnalytics {
  bookingHistory: BookingHistoryItem[]
  spendingBreakdown: SpendingData[]
  travelStats: TravelStat[]
  carbonFootprint: CarbonFootprint
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<UserAnalytics | null>(null)

  useEffect(() => {
    // TODO: Replace with actual API call
    // const fetchAnalytics = async () => {
    //   const response = await fetch('/api/analytics')
    //   const data = await response.json()
    //   setAnalytics(data)
    //   setLoading(false)
    // }
    // fetchAnalytics()

    // Mock data for demonstration
    const mockAnalytics: UserAnalytics = {
      bookingHistory: [
        { id: '1', date: '2024-01-15', route: 'NYC -> LAX', amount: 450, pointsEarned: 4500, status: 'completed' },
        { id: '2', date: '2024-02-20', route: 'LAX -> LHR', amount: 1200, pointsEarned: 18000, status: 'completed' },
        { id: '3', date: '2024-03-10', route: 'LHR -> CDG', amount: 350, pointsEarned: 3500, status: 'completed' },
        { id: '4', date: '2024-04-05', route: 'CDG -> HND', amount: 890, pointsEarned: 8900, status: 'completed' },
        { id: '5', date: '2024-05-12', route: 'HND -> SIN', amount: 420, pointsEarned: 4200, status: 'upcoming' },
      ],
      spendingBreakdown: [
        { month: 'Jan', amount: 450 },
        { month: 'Feb', amount: 1200 },
        { month: 'Mar', amount: 350 },
        { month: 'Apr', amount: 890 },
        { month: 'May', amount: 420 },
      ],
      travelStats: [
        { label: 'Total Miles Flown', value: 24580, unit: 'miles' },
        { label: 'Countries Visited', value: 4, unit: 'countries' },
        { label: 'Total Flights', value: 12, unit: 'flights' },
        { label: 'Airports Visited', value: 8, unit: 'airports' },
      ],
      carbonFootprint: {
        total: 2.5,
        offset: 1.2,
        monthly: [
          { month: 'Jan', emissions: 0.4, offset: 0.2 },
          { month: 'Feb', emissions: 0.7, offset: 0.3 },
          { month: 'Mar', emissions: 0.3, offset: 0.2 },
          { month: 'Apr', emissions: 0.6, offset: 0.3 },
          { month: 'May', emissions: 0.5, offset: 0.2 },
        ],
      },
    }

    setTimeout(() => {
      setAnalytics(mockAnalytics)
      setLoading(false)
    }, 1000)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/4"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="h-64 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-muted-foreground">Unable to load analytics data</p>
        </div>
      </div>
    )
  }

  const routeData = analytics.bookingHistory.map((booking) => ({
    name: booking.route.split(' -> ')[0],
    value: booking.amount,
  }))

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Plane className="h-8 w-8 text-primary" />
              <span className="font-serif font-bold text-2xl text-foreground">Traqora</span>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">
            Travel Analytics
          </h1>
          <p className="text-muted-foreground">
            Track your travel history, spending patterns, and environmental impact.
          </p>
        </div>

        {/* Travel Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {analytics.travelStats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground">
                      {stat.value.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{stat.unit}</p>
                  </div>
                  <div className="p-3 bg-primary/10 rounded-full">
                    <BarChart3 className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="history" className="space-y-6">
          <TabsList>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Booking History
            </TabsTrigger>
            <TabsTrigger value="spending" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Spending
            </TabsTrigger>
            <TabsTrigger value="environment" className="flex items-center gap-2">
              <Leaf className="h-4 w-4" />
              Carbon Footprint
            </TabsTrigger>
          </TabsList>

          {/* Booking History */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Recent Bookings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics.bookingHistory.map((booking) => (
                    <div
                      key={booking.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-full">
                          <Plane className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{booking.route}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(booking.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">
                          ${booking.amount.toLocaleString()}
                        </p>
                        <p className="text-sm text-green-600">
                          +{booking.pointsEarned.toLocaleString()} pts
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Spending Breakdown */}
          <TabsContent value="spending" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Monthly Spending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analytics.spendingBreakdown}>
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`$${value}`, 'Spent']} />
                      <Bar dataKey="amount" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <PieChart className="h-5 w-5" />
                    Spending by Route
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <RePieChart>
                      <Pie
                        data={routeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {routeData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Carbon Footprint */}
          <TabsContent value="environment" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-1">
                <CardHeader>
                  <CardTitle className="font-serif flex items-center gap-2">
                    <Leaf className="h-5 w-5 text-green-500" />
                    Total Impact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total CO₂ Emissions</p>
                    <p className="text-3xl font-bold text-foreground">
                      {analytics.carbonFootprint.total.toFixed(1)}
                    </p>
                    <p className="text-sm text-muted-foreground">metric tons</p>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Carbon Offset</p>
                    <p className="text-3xl font-bold text-green-600">
                      {analytics.carbonFootprint.offset.toFixed(1)}
                    </p>
                    <p className="text-sm text-muted-foreground">metric tons</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Offset Progress</p>
                    <Progress
                      value={(analytics.carbonFootprint.offset / analytics.carbonFootprint.total) * 100}
                      className="h-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {((analytics.carbonFootprint.offset / analytics.carbonFootprint.total) * 100).toFixed(0)}% offset
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="font-serif">Monthly Emissions & Offset</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <ReLineChart data={analytics.carbonFootprint.monthly}>
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="emissions" stroke="#ef4444" name="Emissions" />
                      <Line type="monotone" dataKey="offset" stroke="#22c55e" name="Offset" />
                    </ReLineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

