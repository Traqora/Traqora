"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Plane,
  Users,
  DollarSign,
  TrendingUp,
  Shield,
  Settings,
  BarChart3,
  Activity,
  AlertTriangle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Database,
} from "lucide-react"

// Mock data for admin dashboard
const dashboardStats = {
  totalBookings: 12847,
  totalRevenue: 2847392,
  activeUsers: 8934,
  totalFlights: 1247,
  monthlyGrowth: 12.5,
  refundRate: 2.3,
  avgBookingValue: 421,
  platformFee: 0,
}

const recentBookings = [
  {
    id: "TRQ-001",
    user: "john.doe@email.com",
    flight: "DL 1234 JFK → LAX",
    amount: "450 USDC",
    status: "confirmed",
    date: "2024-12-15",
  },
  {
    id: "TRQ-002",
    user: "jane.smith@email.com",
    flight: "AA 5678 LAX → JFK",
    amount: "425 USDC",
    status: "pending",
    date: "2024-12-15",
  },
  {
    id: "TRQ-003",
    user: "mike.wilson@email.com",
    flight: "UA 9012 ORD → SFO",
    amount: "380 ETH",
    status: "refunded",
    date: "2024-12-14",
  },
]

const systemAlerts = [
  {
    type: "warning",
    message: "High refund rate detected for Flight DL 5555",
    time: "2 hours ago",
  },
  {
    type: "info",
    message: "New airline partnership request from Southwest Airlines",
    time: "4 hours ago",
  },
  {
    type: "success",
    message: "Smart contract upgrade completed successfully",
    time: "1 day ago",
  },
]

export default function AdminDashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState("7d")

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Admin Navigation */}
      <nav className="border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-xl flex items-center justify-center">
                <Plane className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <span className="font-serif font-bold text-xl text-foreground">Traqora</span>
                <Badge variant="secondary" className="ml-2 text-xs">
                  Admin
                </Badge>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" className="bg-background/50">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
              <Button variant="outline" size="sm" className="bg-background/50">
                <Shield className="h-4 w-4 mr-2" />
                Security
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Monitor and manage your decentralized flight booking platform</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Bookings</p>
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.totalBookings.toLocaleString()}</p>
                  <div className="flex items-center mt-2">
                    <ArrowUpRight className="h-4 w-4 text-secondary mr-1" />
                    <span className="text-sm text-secondary font-medium">+{dashboardStats.monthlyGrowth}%</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
                  <Plane className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold text-foreground">${dashboardStats.totalRevenue.toLocaleString()}</p>
                  <div className="flex items-center mt-2">
                    <ArrowUpRight className="h-4 w-4 text-secondary mr-1" />
                    <span className="text-sm text-secondary font-medium">+18.2%</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-secondary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Users</p>
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.activeUsers.toLocaleString()}</p>
                  <div className="flex items-center mt-2">
                    <ArrowUpRight className="h-4 w-4 text-secondary mr-1" />
                    <span className="text-sm text-secondary font-medium">+7.4%</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Refund Rate</p>
                  <p className="text-2xl font-bold text-foreground">{dashboardStats.refundRate}%</p>
                  <div className="flex items-center mt-2">
                    <ArrowDownRight className="h-4 w-4 text-green-500 mr-1" />
                    <span className="text-sm text-green-500 font-medium">-0.8%</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Recent Bookings */}
            <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Recent Bookings</span>
                  <Button variant="outline" size="sm" className="bg-background/50">
                    View All
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {recentBookings.map((booking) => (
                    <div key={booking.id} className="flex items-center justify-between p-4 bg-muted/20 rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Plane className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{booking.flight}</p>
                          <p className="text-sm text-muted-foreground">{booking.user}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-foreground">{booking.amount}</p>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              booking.status === "confirmed"
                                ? "default"
                                : booking.status === "pending"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className="text-xs"
                          >
                            {booking.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{booking.date}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Analytics Chart Placeholder */}
            <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Revenue Analytics</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={selectedPeriod === "7d" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPeriod("7d")}
                      className={selectedPeriod !== "7d" ? "bg-background/50" : ""}
                    >
                      7D
                    </Button>
                    <Button
                      variant={selectedPeriod === "30d" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPeriod("30d")}
                      className={selectedPeriod !== "30d" ? "bg-background/50" : ""}
                    >
                      30D
                    </Button>
                    <Button
                      variant={selectedPeriod === "90d" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedPeriod("90d")}
                      className={selectedPeriod !== "90d" ? "bg-background/50" : ""}
                    >
                      90D
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 bg-muted/10 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">Revenue chart would be displayed here</p>
                    <p className="text-sm text-muted-foreground mt-2">Integration with charting library needed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* System Status */}
            <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Smart Contracts</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-500">Operational</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Starknet Network</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-500">Healthy</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">API Services</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-sm text-yellow-500">Degraded</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Database</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-green-500">Operational</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* System Alerts */}
            <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  System Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {systemAlerts.map((alert, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-muted/20 rounded-lg">
                    <div className="mt-1">
                      {alert.type === "warning" && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                      {alert.type === "info" && <Activity className="h-4 w-4 text-blue-500" />}
                      {alert.type === "success" && <CheckCircle className="h-4 w-4 text-green-500" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{alert.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.time}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start bg-background/50" asChild>
                  <a href="/admin/flights">
                    <Plane className="h-4 w-4 mr-2" />
                    Manage Flights
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start bg-background/50" asChild>
                  <a href="/admin/users">
                    <Users className="h-4 w-4 mr-2" />
                    User Management
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start bg-background/50">
                  <Database className="h-4 w-4 mr-2" />
                  System Backup
                </Button>
                <Button variant="outline" className="w-full justify-start bg-background/50">
                  <Shield className="h-4 w-4 mr-2" />
                  Security Audit
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
