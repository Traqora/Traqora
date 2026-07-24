'use client'

import { useState } from 'react'
import { apiClient, BulkBookingRequest, generateIdempotencyKey } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface BookingItem {
  id: string
  flightId: string
  passenger: {
    email: string
    firstName: string
    lastName: string
    phone?: string
    sorobanAddress: string
  }
}

export default function BulkBookingPage() {
  const [loading, setLoading] = useState(false)
  const [bulkBooking, setBulkBooking] = useState<Partial<BulkBookingRequest>>({
    name: '',
    type: 'custom',
    organizationName: '',
    contactEmail: '',
    contactPhone: '',
    bookings: [],
    notes: '',
  })
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string>('')

  const addBooking = () => {
    const newBooking: BookingItem = {
      id: Date.now().toString(),
      flightId: '',
      passenger: {
        email: '',
        firstName: '',
        lastName: '',
        phone: '',
        sorobanAddress: '',
      },
    }
    setBookings([...bookings, newBooking])
  }

  const removeBooking = (id: string) => {
    setBookings(bookings.filter(b => b.id !== id))
  }

  const updateBooking = (id: string, field: string, value: string) => {
    setBookings(bookings.map(b => {
      if (b.id === id) {
        if (field.startsWith('passenger.')) {
          const passengerField = field.split('.')[1]
          return {
            ...b,
            passenger: { ...b.passenger, [passengerField]: value }
          }
        }
        return { ...b, [field]: value }
      }
      return b
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const idempotencyKey = generateIdempotencyKey()
      const request: BulkBookingRequest = {
        ...bulkBooking,
        bookings: bookings.map(b => ({
          flightId: b.flightId,
          passenger: b.passenger,
        })),
      }

      const response = await apiClient.createBulkBooking(request, idempotencyKey)
      setResult(response.data)
    } catch (err: any) {
      setError(err.message || 'Failed to create bulk booking')
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500'
      case 'partial_completed': return 'bg-yellow-500'
      case 'failed': return 'bg-red-500'
      case 'processing': return 'bg-blue-500'
      default: return 'bg-gray-500'
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Bulk Booking</h1>
          <p className="text-gray-600">Create multiple flight bookings at once for corporate travel, agencies, or groups.</p>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Bulk Booking Details */}
            <Card>
              <CardHeader>
                <CardTitle>Bulk Booking Details</CardTitle>
                <CardDescription>Enter the general information for this bulk booking</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Booking Name *</Label>
                    <Input
                      id="name"
                      value={bulkBooking.name}
                      onChange={(e) => setBulkBooking({ ...bulkBooking, name: e.target.value })}
                      required
                      placeholder="e.g., Company Q3 Travel"
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Booking Type</Label>
                    <Select
                      value={bulkBooking.type}
                      onValueChange={(value) => setBulkBooking({ ...bulkBooking, type: value as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="corporate">Corporate</SelectItem>
                        <SelectItem value="agency">Agency</SelectItem>
                        <SelectItem value="group">Group</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="organization">Organization Name</Label>
                    <Input
                      id="organization"
                      value={bulkBooking.organizationName}
                      onChange={(e) => setBulkBooking({ ...bulkBooking, organizationName: e.target.value })}
                      placeholder="e.g., Acme Corp"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Contact Email *</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      value={bulkBooking.contactEmail}
                      onChange={(e) => setBulkBooking({ ...bulkBooking, contactEmail: e.target.value })}
                      required
                      placeholder="contact@company.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <Input
                      id="contactPhone"
                      value={bulkBooking.contactPhone}
                      onChange={(e) => setBulkBooking({ ...bulkBooking, contactPhone: e.target.value })}
                      placeholder="+1 234 567 890"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={bulkBooking.notes}
                    onChange={(e) => setBulkBooking({ ...bulkBooking, notes: e.target.value })}
                    placeholder="Any additional notes for this bulk booking..."
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Individual Bookings */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Individual Bookings</CardTitle>
                    <CardDescription>Add flight bookings to be processed together</CardDescription>
                  </div>
                  <Button type="button" onClick={addBooking} variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Booking
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No bookings added yet. Click "Add Booking" to get started.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bookings.map((booking, index) => (
                      <div key={booking.id} className="border rounded-lg p-4 relative">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                          onClick={() => removeBooking(booking.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <div className="font-medium mb-3">Booking #{index + 1}</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`flight-${booking.id}`}>Flight ID *</Label>
                            <Input
                              id={`flight-${booking.id}`}
                              value={booking.flightId}
                              onChange={(e) => updateBooking(booking.id, 'flightId', e.target.value)}
                              required
                              placeholder="Enter flight ID"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`email-${booking.id}`}>Passenger Email *</Label>
                            <Input
                              id={`email-${booking.id}`}
                              type="email"
                              value={booking.passenger.email}
                              onChange={(e) => updateBooking(booking.id, 'passenger.email', e.target.value)}
                              required
                              placeholder="passenger@email.com"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`firstName-${booking.id}`}>First Name *</Label>
                            <Input
                              id={`firstName-${booking.id}`}
                              value={booking.passenger.firstName}
                              onChange={(e) => updateBooking(booking.id, 'passenger.firstName', e.target.value)}
                              required
                              placeholder="John"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`lastName-${booking.id}`}>Last Name *</Label>
                            <Input
                              id={`lastName-${booking.id}`}
                              value={booking.passenger.lastName}
                              onChange={(e) => updateBooking(booking.id, 'passenger.lastName', e.target.value)}
                              required
                              placeholder="Doe"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`phone-${booking.id}`}>Phone</Label>
                            <Input
                              id={`phone-${booking.id}`}
                              value={booking.passenger.phone || ''}
                              onChange={(e) => updateBooking(booking.id, 'passenger.phone', e.target.value)}
                              placeholder="+1 234 567 890"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`soroban-${booking.id}`}>Stellar Address *</Label>
                            <Input
                              id={`soroban-${booking.id}`}
                              value={booking.passenger.sorobanAddress}
                              onChange={(e) => updateBooking(booking.id, 'passenger.sorobanAddress', e.target.value)}
                              required
                              placeholder="G..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => setBookings([])}>
                Clear All
              </Button>
              <Button type="submit" disabled={loading || bookings.length === 0}>
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Create Bulk Booking'
                )}
              </Button>
            </div>
          </form>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Bulk Booking Created</CardTitle>
              <CardDescription>Your bulk booking has been processed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Booking ID</Label>
                  <p className="font-mono text-sm">{result.bulkBooking.id}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <Badge className={getStatusColor(result.bulkBooking.status)}>
                    {result.bulkBooking.status}
                  </Badge>
                </div>
                <div>
                  <Label>Total Bookings</Label>
                  <p>{result.bulkBooking.totalBookings}</p>
                </div>
                <div>
                  <Label>Successful</Label>
                  <p className="text-green-600">{result.successfulBookings.length}</p>
                </div>
                <div>
                  <Label>Failed</Label>
                  <p className="text-red-600">{result.failedBookings.length}</p>
                </div>
                <div>
                  <Label>Total Amount</Label>
                  <p>${(result.bulkBooking.totalAmountCents / 100).toFixed(2)}</p>
                </div>
              </div>

              {result.failedBookings.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-medium mb-2">Failed Bookings</h3>
                  <div className="space-y-2">
                    {result.failedBookings.map((failed: any, idx: number) => (
                      <div key={idx} className="bg-red-50 p-3 rounded text-sm">
                        <p><strong>Passenger:</strong> {failed.booking.passenger.email}</p>
                        <p><strong>Error:</strong> {failed.error}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={() => {
                setResult(null)
                setBookings([])
                setBulkBooking({
                  name: '',
                  type: 'custom',
                  organizationName: '',
                  contactEmail: '',
                  contactPhone: '',
                  bookings: [],
                  notes: '',
                })
              }}>
                Create Another Bulk Booking
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
