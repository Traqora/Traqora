"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users,
  Search,
  Filter,
  Eye,
  ArrowLeft,
  Mail,
  Calendar,
  DollarSign,
  Plane,
  AlertTriangle,
  CheckCircle,
  MessageSquare,
  TrendingUp,
} from "lucide-react"

// Mock user data for admin management
const mockUsers = [
  {
    id: "USR001",
    email: "john.doe@email.com",
    name: "John Doe",
    walletAddress: "0x1234...5678",
    joinDate: "2024-01-15",
    lastActive: "2024-12-14",
    status: "active",
    totalBookings: 12,
    totalSpent: 5420,
    loyaltyPoints: 1250,
    verificationStatus: "verified",
    supportTickets: 2,
  },
  {
    id: "USR002",
    email: "jane.smith@email.com",
    name: "Jane Smith",
    walletAddress: "0x5678...9012",
    joinDate: "2024-02-20",
    lastActive: "2024-12-15",
    status: "active",
    totalBookings: 8,
    totalSpent: 3240,
    loyaltyPoints: 890,
    verificationStatus: "verified",
    supportTickets: 0,
  },
  {
    id: "USR003",
    email: "mike.wilson@email.com",
    name: "Mike Wilson",
    walletAddress: "0x9012...3456",
    joinDate: "2024-03-10",
    lastActive: "2024-12-10",
    status: "suspended",
    totalBookings: 3,
    totalSpent: 1150,
    loyaltyPoints: 320,
    verificationStatus: "pending",
    supportTickets: 5,
  },
  {
    id: "USR004",
    email: "sarah.johnson@email.com",
    name: "Sarah Johnson",
    walletAddress: "0x3456...7890",
    joinDate: "2024-04-05",
    lastActive: "2024-12-15",
    status: "active",
    totalBookings: 15,
    totalSpent: 7890,
    loyaltyPoints: 2100,
    verificationStatus: "verified",
    supportTickets: 1,
  },
]

const mockBookings = [
  {
    id: "TRQ-001",
    userId: "USR001",
    flight: "DL 1234 JFK → LAX",
    date: "2024-12-15",
    amount: "450 USDC",
    status: "confirmed",
  },
  {
    id: "TRQ-002",
    userId: "USR001",
    flight: "AA 5678 LAX → JFK",
    date: "2024-11-20",
    amount: "425 USDC",
    status: "completed",
  },
]

const mockSupportTickets = [
  {
    id: "TKT-001",
    userId: "USR003",
    subject: "Refund request for cancelled flight",
    status: "open",
    priority: "high",
    created: "2024-12-14",
  },
  {
    id: "TKT-002",
    userId: "USR001",
    subject: "Unable to connect wallet",
    status: "resolved",
    priority: "medium",
    created: "2024-12-10",
  },
]

export default function AdminUserManagement() {
  const [users, setUsers] = useState(mockUsers)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedUser, setSelectedUser] = useState(null)
  const [isUserDetailOpen, setIsUserDetailOpen] = useState(false)

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.walletAddress.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === "all" || user.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleStatusChange = (userId, newStatus) => {
    setUsers(users.map((user) => (user.id === userId ? { ...user, status: newStatus } : user)))
  }

  const handleViewUser = (user) => {
    setSelectedUser(user)
    setIsUserDetailOpen(true)
  }

  const userBookings = selectedUser ? mockBookings.filter((booking) => booking.userId === selectedUser.id) : []
  const userTickets = selectedUser ? mockSupportTickets.filter((ticket) => ticket.userId === selectedUser.id) : []

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
                  <Users className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <span className="font-serif font-bold text-xl text-foreground">User Management</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    Admin
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Button variant="outline" size="sm" className="bg-background/50">
                <MessageSquare className="h-4 w-4 mr-2" />
                Support Queue ({mockSupportTickets.filter((t) => t.status === "open").length})
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif font-bold text-3xl text-foreground mb-2">User Management</h1>
          <p className="text-muted-foreground">Manage users, bookings, and support requests</p>
        </div>

        {/* User Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Users</p>
                  <p className="text-xl font-bold text-foreground">{users.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Users</p>
                  <p className="text-xl font-bold text-foreground">
                    {users.filter((u) => u.status === "active").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-secondary/10 rounded-lg flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-xl font-bold text-foreground">
                    ${users.reduce((sum, u) => sum + u.totalSpent, 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-500/10 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Tickets</p>
                  <p className="text-xl font-bold text-foreground">
                    {mockSupportTickets.filter((t) => t.status === "open").length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6 border-0 bg-background/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="search">Search Users</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by email, name, or wallet address..."
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
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User List */}
        <Card className="border-0 bg-background/60 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle>User List ({filteredUsers.length} users)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div key={user.id} className="p-6 bg-muted/20 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* User Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-foreground">{user.name}</h3>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge
                            variant={
                              user.status === "active"
                                ? "default"
                                : user.status === "suspended"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {user.status}
                          </Badge>
                          <Badge
                            variant={user.verificationStatus === "verified" ? "secondary" : "outline"}
                            className={
                              user.verificationStatus === "verified"
                                ? "bg-green-500/10 text-green-500 border-green-500/20"
                                : ""
                            }
                          >
                            {user.verificationStatus}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-xs">{user.walletAddress}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Joined {user.joinDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Plane className="h-4 w-4 text-muted-foreground" />
                          <span>{user.totalBookings} bookings</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>${user.totalSpent.toLocaleString()} spent</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mt-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-muted-foreground" />
                          <span>{user.loyaltyPoints} loyalty points</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <span>{user.supportTickets} support tickets</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>Last active {user.lastActive}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Select value={user.status} onValueChange={(value) => handleStatusChange(user.id, value)}>
                        <SelectTrigger className="w-32 bg-background/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-background/50"
                        onClick={() => handleViewUser(user)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* User Detail Dialog */}
        <Dialog open={isUserDetailOpen} onOpenChange={setIsUserDetailOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">
                    {selectedUser?.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </span>
                </div>
                {selectedUser?.name}
              </DialogTitle>
            </DialogHeader>

            {selectedUser && (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="bookings">Bookings ({userBookings.length})</TabsTrigger>
                  <TabsTrigger value="support">Support ({userTickets.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">User Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Email:</span>
                          <span>{selectedUser.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Wallet:</span>
                          <span className="font-mono text-sm">{selectedUser.walletAddress}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge
                            variant={
                              selectedUser.status === "active"
                                ? "default"
                                : selectedUser.status === "suspended"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {selectedUser.status}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Verification:</span>
                          <Badge
                            variant={selectedUser.verificationStatus === "verified" ? "secondary" : "outline"}
                            className={
                              selectedUser.verificationStatus === "verified"
                                ? "bg-green-500/10 text-green-500 border-green-500/20"
                                : ""
                            }
                          >
                            {selectedUser.verificationStatus}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Join Date:</span>
                          <span>{selectedUser.joinDate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Active:</span>
                          <span>{selectedUser.lastActive}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Activity Summary</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Bookings:</span>
                          <span className="font-bold">{selectedUser.totalBookings}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Total Spent:</span>
                          <span className="font-bold">${selectedUser.totalSpent.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Loyalty Points:</span>
                          <span className="font-bold">{selectedUser.loyaltyPoints}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Support Tickets:</span>
                          <span className="font-bold">{selectedUser.supportTickets}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avg. Booking Value:</span>
                          <span className="font-bold">
                            ${Math.round(selectedUser.totalSpent / selectedUser.totalBookings)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                <TabsContent value="bookings" className="space-y-4">
                  <div className="space-y-3">
                    {userBookings.map((booking) => (
                      <div key={booking.id} className="p-4 bg-muted/20 rounded-lg">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="font-medium">{booking.flight}</p>
                            <p className="text-sm text-muted-foreground">Booking ID: {booking.id}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">{booking.amount}</p>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  booking.status === "confirmed"
                                    ? "default"
                                    : booking.status === "completed"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {booking.status}
                              </Badge>
                              <span className="text-sm text-muted-foreground">{booking.date}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="support" className="space-y-4">
                  <div className="space-y-3">
                    {userTickets.map((ticket) => (
                      <div key={ticket.id} className="p-4 bg-muted/20 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{ticket.subject}</p>
                            <p className="text-sm text-muted-foreground">Ticket ID: {ticket.id}</p>
                            <p className="text-sm text-muted-foreground">Created: {ticket.created}</p>
                          </div>
                          <div className="flex gap-2">
                            <Badge
                              variant={
                                ticket.status === "open"
                                  ? "destructive"
                                  : ticket.status === "resolved"
                                    ? "secondary"
                                    : "outline"
                              }
                            >
                              {ticket.status}
                            </Badge>
                            <Badge variant="outline">{ticket.priority}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
