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
  }
}