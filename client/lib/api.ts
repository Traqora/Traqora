// API client for Traqora backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
    details?: any;
  };
}

export interface Flight {
  id: string;
  airline: string;
  flightNumber: string;
  fromAirport: string;
  toAirport: string;
  departureTime: Date;
  arrivalTime: Date;
  priceCents: number;
  currency: string;
  seatsAvailable: number;
  airlineSorobanAddress: string;
}

export interface Passenger {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  sorobanAddress: string;
}

export interface Booking {
  id: string;
  flight: Flight;
  passenger: Passenger;
  status: string;
  amountCents: number;
  stripePaymentIntentId?: string;
  stripeClientSecret?: string;
  sorobanUnsignedXdr?: string;
  sorobanTxHash?: string;
  sorobanBookingId?: string;
  contractSubmitAttempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingRequest {
  flightId: string;
  passenger: Passenger;
}

export interface CreateBookingResponse {
  data: Booking;
  payment: {
    paymentIntentId: string;
    clientSecret: string;
  };
  soroban: {
    unsignedXdr: string;
    networkPassphrase: string;
  };
}

export interface TransactionStatus {
  bookingStatus: string;
  transactionStatus: {
    status: 'pending' | 'success' | 'failed' | 'not_found';
    txHash?: string;
    result?: any;
    error?: string;
  } | null;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error || {
            message: 'Request failed',
            code: 'REQUEST_FAILED',
          },
        };
      }

      return data;
    } catch (error: any) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: {
          message: error.message || 'Network error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  async createBooking(
    request: CreateBookingRequest,
    idempotencyKey: string
  ): Promise<ApiResponse<CreateBookingResponse>> {
    return this.request<CreateBookingResponse>('/api/bookings', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(request),
    });
  }

  async getBooking(bookingId: string): Promise<ApiResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${bookingId}`);
  }

  async submitSignedTransaction(
    bookingId: string,
    signedXdr: string
  ): Promise<ApiResponse<Booking>> {
    return this.request<Booking>(`/api/bookings/${bookingId}/submit-onchain`, {
      method: 'POST',
      body: JSON.stringify({ signedXdr }),
    });
  }

  async getTransactionStatus(
    bookingId: string
  ): Promise<ApiResponse<TransactionStatus>> {
    return this.request<TransactionStatus>(
      `/api/bookings/${bookingId}/transaction-status`
    );
  }

  async getFlight(flightId: string): Promise<ApiResponse<Flight>> {
    return this.request<Flight>(`/api/flights/${flightId}`);
  }
}

export const apiClient = new ApiClient();

// Utility function to generate idempotency key
export const generateIdempotencyKey = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
