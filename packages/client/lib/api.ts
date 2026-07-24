const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface FlightSearchParams {
  from: string
  to: string
  date: string
  passengers: number
  class: "economy" | "premium_economy" | "business" | "first"
  price_min?: number
  price_max?: number
  airlines?: string[]
  stops?: number
  duration_max?: number
  sort?: "price" | "duration" | "departure_time" | "rating"
  sort_order?: "asc" | "desc"
  cursor?: string
  page_size?: number
}

export interface Flight {
  id: string
  from: string
  to: string
  departure_time: string
  arrival_time?: string
  airline: string
  stops: number
  duration: number
  price: number
  rating: number
  available_seats: number
  class: "economy" | "premium_economy" | "business" | "first"
  fromCity?: string
  toCity?: string
  airline_name?: string
}

export interface FlightSearchResponse {
  data: Flight[]
  pagination: {
    next_cursor: string | null
    has_more: boolean
    page_size: number
  }
}

export interface CreateBookingRequest {
  flightId: string
  passengerCount: number
  seatId?: string
  walletAddress: string
}

export interface Booking {
  id: string
  flightId: string
  status: 'pending' | 'confirmed' | 'failed'
  price: string
  currency: string
}

export interface BulkBooking {
  id: string
  name: string
  type: 'corporate' | 'agency' | 'group' | 'custom'
  status: 'pending' | 'processing' | 'partial_completed' | 'completed' | 'failed' | 'cancelled'
  totalBookings: number
  completedBookings: number
  failedBookings: number
  totalAmountCents: number
  processedAmountCents: number
  organizationName?: string
  contactEmail?: string
  contactPhone?: string
  metadata?: Record<string, any>
  notes?: string
  failureReason?: string
  createdAt: string
  updatedAt: string
}

export interface BulkBookingRequest {
  name: string
  type?: 'corporate' | 'agency' | 'group' | 'custom'
  organizationName?: string
  contactEmail?: string
  contactPhone?: string
  bookings: Array<{
    flightId: string
    passenger: {
      email: string
      firstName: string
      lastName: string
      phone?: string
      sorobanAddress: string
    }
  }>
  metadata?: Record<string, any>
  notes?: string
}

export interface GroupBookingTemplate {
  id: string
  name: string
  description: string
  visibility: 'private' | 'organization' | 'public'
  templateConfig: {
    flights: Array<{
      origin: string
      destination: string
      cabinClass: string
      preferredAirline?: string
    }>
    splitMethod: 'equal' | 'custom' | 'percentage'
    defaultNotes?: string
  }
  usageCount: number
  organizationId?: string
  createdById?: string
  tags?: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TransactionStatus {
  status: 'pending' | 'success' | 'failed'
  hash?: string
}

export interface PerformanceSnapshot {
  status: 'healthy' | 'degraded' | 'critical'
  generatedAt: string
  queryPerformance: {
    totalQueries: number
    errorCount: number
    averageMs: number
    p50Ms: number
    p95Ms: number
    p99Ms: number
    slowest: null | {
      component: string
      operation: string
      status: 'success' | 'error'
      durationMs: number
      timestamp: string
    }
  }
  cache: {
    overallHitRate: number
    caches: Array<{
      cache: string
      hits: number
      misses: number
      sets: number
      fallbacks: number
      errors: number
      totalGets: number
      hitRate: number
      averageDurationMs: number
    }>
  }
  systemHealth: {
    uptimeSeconds: number
    memoryUsageMb: {
      rss: number
      heapUsed: number
      heapTotal: number
    }
    cpuLoadAverage: number[]
    cpuCount: number
  }
  alerts: Array<{
    id: string
    severity: 'info' | 'warning' | 'critical'
    metric: string
    message: string
    value: number
    threshold: number
    timestamp: string
  }>
  capacityPlanning: {
    heapUsedRatio: number
    projectedDailyQueries: number
    cacheEfficiency: number
    recommendations: string[]
  }
  sla: {
    targets: {
      queryP95Ms: number
      cacheHitRate: number
      errorRate: number
    }
    queryP95WithinSla: boolean
    cacheHitRateWithinSla: boolean
    errorRateWithinSla: boolean
    errorRate: number
  }
  recentQueries: Array<{
    component: string
    operation: string
    status: 'success' | 'error'
    durationMs: number
    timestamp: string
  }>
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Create a fetch wrapper with base URL and headers
const api = {
  get: async (endpoint: string, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    })
    return response
  },

  post: async (endpoint: string, body: any, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...options,
    })
    return response
  },

  put: async (endpoint: string, body: any, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      ...options,
    })
    return response
  },

  delete: async (endpoint: string, options?: RequestInit) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    })
    return response
  },
}

export { api }

export function generateIdempotencyKey(): string {
  return Math.random().toString(36).substring(2, 15)
}

export async function searchFlights(params: FlightSearchParams): Promise<FlightSearchResponse> {
  const searchParams = new URLSearchParams()
  
  searchParams.append('from', params.from)
  searchParams.append('to', params.to)
  searchParams.append('date', params.date)
  searchParams.append('passengers', params.passengers.toString())
  searchParams.append('class', params.class)
  
  if (params.price_min !== undefined) searchParams.append('price_min', params.price_min.toString())
  if (params.price_max !== undefined) searchParams.append('price_max', params.price_max.toString())
  if (params.airlines && params.airlines.length > 0) searchParams.append('airlines', params.airlines.join(','))
  if (params.stops !== undefined) searchParams.append('stops', params.stops.toString())
  if (params.duration_max !== undefined) searchParams.append('duration_max', params.duration_max.toString())
  if (params.sort) searchParams.append('sort', params.sort)
  if (params.sort_order) searchParams.append('sort_order', params.sort_order)
  if (params.cursor) searchParams.append('cursor', params.cursor)
  if (params.page_size) searchParams.append('page_size', params.page_size.toString())

  const url = `${API_BASE_URL}/api/flights/search?${searchParams.toString()}`
  
  try {
    const response = await fetch(url)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
    }
    return await response.json()
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
  }
}

export async function getPerformanceSnapshot(): Promise<PerformanceSnapshot> {
  const response = await fetch(`${API_BASE_URL}/health/performance`, { cache: 'no-store' })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
  }
  return response.json()
}

export const apiClient = {
  searchFlights: async (params: FlightSearchParams) => {
    try {
      const response = await searchFlights(params)
      return { success: true, data: response.data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },
  
  createBooking: async (request: CreateBookingRequest, idempotencyKey?: string) => {
    return {
      success: true,
      data: {
        data: {
          id: "BOOK-" + Math.random().toString(36).substring(2, 9).toUpperCase(),
          flightId: request.flightId,
          status: 'pending',
          price: "450",
          currency: "USDC"
        },
        soroban: {
          unsignedXdr: "AAAA...",
          networkPassphrase: "Test SDF Network ; September 2015"
        }
      }
    }
  },
  
  submitSignedTransaction: async (bookingId: string, signedXdr: string) => {
    return {
      success: true,
      data: {
        id: bookingId,
        flightId: "1",
        status: 'confirmed',
        price: "450",
        currency: "USDC"
      }
    }
  },
  
  getTransactionStatus: async (bookingId: string) => {
    return {
      success: true,
      data: {
        status: 'success',
        hash: "HASH" + Math.random().toString(36).substring(2, 9).toUpperCase()
      }
    }
  },

  getPerformanceSnapshot: async () => {
    try {
      const data = await getPerformanceSnapshot()
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  // Bulk Booking API methods
  createBulkBooking: async (request: BulkBookingRequest, idempotencyKey?: string) => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/bulk-bookings`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }

      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getBulkBooking: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/bulk-bookings/${id}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getBulkBookings: async (params: { organization?: string; email?: string; status?: string; type?: string }) => {
    try {
      const searchParams = new URLSearchParams()
      if (params.organization) searchParams.append('organization', params.organization)
      if (params.email) searchParams.append('email', params.email)
      if (params.status) searchParams.append('status', params.status)
      if (params.type) searchParams.append('type', params.type)

      const response = await fetch(`${API_BASE_URL}/api/v1/bulk-bookings?${searchParams.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  cancelBulkBooking: async (id: string, reason: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/bulk-bookings/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  retryBulkBooking: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/bulk-bookings/${id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  // Group Booking Templates API methods
  createGroupBookingTemplate: async (template: Omit<GroupBookingTemplate, 'id' | 'usageCount' | 'createdAt' | 'updatedAt'>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/group-booking-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getGroupBookingTemplates: async (params: { userId?: string; organizationId?: string; visibility?: string; tags?: string[] }) => {
    try {
      const searchParams = new URLSearchParams()
      if (params.userId) searchParams.append('userId', params.userId)
      if (params.organizationId) searchParams.append('organizationId', params.organizationId)
      if (params.visibility) searchParams.append('visibility', params.visibility)
      if (params.tags) params.tags.forEach(tag => searchParams.append('tags', tag))

      const response = await fetch(`${API_BASE_URL}/api/v1/group-booking-templates?${searchParams.toString()}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getPopularTemplates: async (limit: number = 10) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/group-booking-templates/public/popular?limit=${limit}`)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  // Notification Preferences API methods
  getNotificationPreferences: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/preferences`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  updateNotificationPreferences: async (preferences: Record<string, any>) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/preferences`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(preferences),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  resetNotificationPreferences: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/preferences/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  setTypeChannelPreferences: async (type: string, channels: string[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/preferences/channels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, channels }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getEffectiveChannels: async (type: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/preferences/effective-channels/${type}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  // In-App Notifications API methods
  getInAppNotifications: async (params: { limit?: number; offset?: number; unreadOnly?: boolean; includeArchived?: boolean } = {}) => {
    try {
      const searchParams = new URLSearchParams()
      if (params.limit) searchParams.append('limit', params.limit.toString())
      if (params.offset) searchParams.append('offset', params.offset.toString())
      if (params.unreadOnly) searchParams.append('unreadOnly', 'true')
      if (params.includeArchived) searchParams.append('includeArchived', 'true')

      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/in-app?${searchParams.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getUnreadNotificationCount: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/in-app/unread-count`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  markNotificationAsRead: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/in-app/${id}/read`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  markAllNotificationsAsRead: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/in-app/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  archiveNotification: async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/in-app/${id}/archive`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  getDeliveryLog: async (params: { limit?: number; offset?: number; channel?: string; status?: string } = {}) => {
    try {
      const searchParams = new URLSearchParams()
      if (params.limit) searchParams.append('limit', params.limit.toString())
      if (params.offset) searchParams.append('offset', params.offset.toString())
      if (params.channel) searchParams.append('channel', params.channel)
      if (params.status) searchParams.append('status', params.status)

      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/delivery-log?${searchParams.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },

  retryFailedDeliveries: async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/notifications/delivery-log/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
      }
      return await response.json()
    } catch (error: any) {
      if (error instanceof ApiError) throw error
      throw new ApiError(error instanceof Error ? error.message : 'Unknown error', 0)
    }
  },
}
