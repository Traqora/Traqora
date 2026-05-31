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
  passenger?: {
    email: string
    firstName: string
    lastName: string
    phone?: string
    sorobanAddress: string
  }
  passengerCount?: number
  seatId?: string
  walletAddress: string
}

export interface Booking {
  id: string
  status: 'created' | 'awaiting_payment' | 'payment_processing' | 'paid' | 'onchain_pending' | 'onchain_submitted' | 'confirmed' | 'failed' | 'refunded' | 'refund_rejected'
  amountCents: number
  sorobanTxHash?: string | null
}

export interface TransactionStatus {
  status: 'pending' | 'success' | 'failed'
  hash?: string
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

export function generateIdempotencyKey(): string {
  return Math.random().toString(36).substring(2, 15)
}

const getAuthHeaders = () => {
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_E2E_TEST_MODE === "true") {
    return { Authorization: "Bearer e2e-test-token" }
  }

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("traqora_access_token")
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  return {}
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
    try {
      const passenger = request.passenger || {
        email: "e2e.traveler@traqora.test",
        firstName: "E2E",
        lastName: "Traveler",
        sorobanAddress: request.walletAddress,
      }

      const response = await fetch(`${API_BASE_URL}/api/v1/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey || generateIdempotencyKey(),
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          flightId: request.flightId,
          passenger,
        }),
      })

      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { success: false, error: { message: body.error?.message || `HTTP ${response.status}` } }
      }

      return { success: true, data: body }
    } catch (error: any) {
      return { success: false, error: { message: error.message || "Failed to create booking" } }
    }
  },
  
  submitSignedTransaction: async (bookingId: string, signedXdr: string) => {
    return {
      success: true,
      data: {
        id: bookingId,
        status: 'confirmed',
        amountCents: 45000,
        sorobanTxHash: signedXdr ? "HASH" + Math.random().toString(36).substring(2, 9).toUpperCase() : null
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
  }
}
