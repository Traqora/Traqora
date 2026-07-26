export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export interface FlightSearchParams {
  from: string
  to: string
  date: string
  passengers: number
  class: "economy" | "premium_economy" | "business" | "first"
  price_min?: number
  price_max?: number
  airlines?: string[]
  stops?: number[]
  duration_max?: number
  sort?: "price" | "duration" | "departure_time" | "rating"
  sort_order?: "asc" | "desc"
  cursor?: string
  page_size?: number
}

export type SearchFlightsRequest = FlightSearchParams

export type InsuranceCoverageType = "basic" | "standard" | "premium"

export interface InsuranceCoverageDetails {
  medicalCents: number
  baggageCents: number
  tripCancellationCents: number
}

export interface InsurancePremiumQuote {
  coverageType: InsuranceCoverageType
  premiumCents: number
  coverageDetails: InsuranceCoverageDetails
}

export interface InsurancePolicy {
  id: string
  bookingId: string
  destination: string
  tripCostCents: number
  coverageType: InsuranceCoverageType
  premiumCents: number
  currency: string
  status: "active" | "refunded" | "cancelled" | "expired"
  provider: string
  providerPolicyRef: string
  coverageDetailsJson: string
  purchasedAt: string
  refundEligibleUntil: string
}

export interface InsuranceClaim {
  id: string
  policyId: string
  eventType: "medical" | "baggage" | "trip_cancellation" | "other"
  description: string
  amountRequestedCents: number
  amountApprovedCents?: number | null
  status: "submitted" | "under_review" | "approved" | "rejected" | "paid"
  contactEmail?: string | null
  submittedAt: string
}

export interface PriceTrendPoint {
  date: string
  price: number
}

export interface PriceTrend {
  from: string
  to: string
  points: PriceTrendPoint[]
  currentPrice: number
  changePercent: number
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
  status: 'pending' | 'success' | 'failed' | 'not_found'
  txHash?: string
  result?: any
  error?: string
}

export interface TransactionRecord {
  bookingId: string
  bookingStatus: string
  txHash: string | null
  explorerUrl: string | null
  contractSubmitAttempts: number
  lastError: string | null
  updatedAt: string
}

export interface BookingTransactionStatusResponse {
  bookingStatus: string
  transactionStatus: TransactionStatus | null
}

export type CheckInStatus = 'pending' | 'checked_in' | 'cancelled'

export interface CheckInRecord {
  id: string
  status: CheckInStatus
  seatNumber: string | null
  boardingPassCode: string
  checkedInAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CheckInWindow {
  opensAt: string
  closesAt: string
  isOpen: boolean
}

export type CarbonCabinClass = 'economy' | 'premium_economy' | 'business' | 'first'
export type OffsetProjectType = 'reforestation' | 'renewable' | 'community'

export interface CarbonFootprint {
  flightId: string
  totalCO2kg: number
  cabinClassFactor: number
  distanceKm: number
  calculationMethod: string
}

export interface OffsetProject {
  id: string
  name: string
  type: OffsetProjectType
  pricePerTonCents: number
  description: string
  certifications: string[]
  status: string
  totalOffsetTons: number
}

export interface OffsetCost {
  costCents: number
  tonsToOffset: number
  projectId: string
  projectName: string
  pricePerTonCents: number
}

export interface OffsetCertificate {
  id: string
  purchaseId: string
  certificateRef: string
  co2Kg: number
  tonsOffset: number
  projectName: string
  projectType: OffsetProjectType
  purchasedAt: string
  userId: string
}

export interface SustainabilityStats {
  totalCO2OffsetKg: number
  totalOffsetCents: number
  totalPurchases: number
  projectsSupported: number
  treesEquivalent: number
  carsOffRoadEquivalent: number
  recentPurchases: Array<{
    id: string
    userId: string
    flightId: string
    projectId: string
    amountCents: number
    co2Kg: number
    tonsOffset: number
    status: string
    bookingId?: string
    certificateRef?: string
    createdAt: string
  }>
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

export type ApiResult<T> = { success: true; data: T } | { success: false; error: { message: string } }

function getAuthHeader(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem('traqora-auth')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const token = parsed?.state?.accessToken
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    return {}
  }
}

async function authedFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(options?.headers || {}),
    },
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(body?.error?.message || body?.error || `HTTP ${response.status}`, response.status, body?.error?.code)
  }
  return body
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
  if (params.stops && params.stops.length > 0) searchParams.append('stops', params.stops.join(','))
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

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
  }
  const body = await response.json()
  return body.data as T
}

async function apiPost<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
  }
  const body = await response.json()
  return body.data as T
}

export async function getPriceTrend(from: string, to: string, days = 14): Promise<PriceTrend> {
  return apiGet<PriceTrend>(`/api/flights/price-trend?from=${from}&to=${to}&days=${days}`)
}

export async function getInsuranceQuotes(
  tripCostCents: number,
  destination: string,
): Promise<InsurancePremiumQuote[]> {
  return apiGet<InsurancePremiumQuote[]>(
    `/api/v1/insurance/quotes?tripCostCents=${tripCostCents}&destination=${destination}`,
  )
}

export async function purchaseInsurance(params: {
  bookingId: string
  tripCostCents: number
  destination: string
  coverageType: InsuranceCoverageType
}): Promise<InsurancePolicy> {
  return apiPost<InsurancePolicy>('/api/v1/insurance/purchase', params)
}

export async function getInsurancePolicyByBooking(bookingId: string): Promise<InsurancePolicy | null> {
  return apiGet<InsurancePolicy | null>(`/api/v1/insurance/booking/${bookingId}`)
}

export async function getInsurancePolicy(policyId: string): Promise<InsurancePolicy> {
  return apiGet<InsurancePolicy>(`/api/v1/insurance/policy/${policyId}`)
}

export async function requestInsuranceRefund(policyId: string): Promise<InsurancePolicy> {
  return apiPost<InsurancePolicy>(`/api/v1/insurance/policy/${policyId}/refund`, {})
}

export async function submitInsuranceClaim(
  policyId: string,
  params: {
    eventType: InsuranceClaim['eventType']
    description: string
    amountRequestedCents: number
    contactEmail?: string
  },
): Promise<InsuranceClaim> {
  return apiPost<InsuranceClaim>(`/api/v1/insurance/policy/${policyId}/claims`, params)
}

export async function getInsuranceClaims(policyId: string): Promise<InsuranceClaim[]> {
  return apiGet<InsuranceClaim[]>(`/api/v1/insurance/policy/${policyId}/claims`)
}

export async function getOffsetProjects(): Promise<OffsetProject[]> {
  return apiGet<OffsetProject[]>('/api/v1/carbon/projects')
}

export async function estimateFootprint(
  flightId: string,
  cabinClass: CarbonCabinClass = 'economy',
): Promise<CarbonFootprint> {
  return apiPost<CarbonFootprint>('/api/v1/carbon/estimate', { flightId, cabinClass })
}

export async function calculateOffsetCost(
  footprintKg: number,
  projectId: string,
): Promise<OffsetCost> {
  return apiPost<OffsetCost>('/api/v1/carbon/offset-cost', { footprintKg, projectId })
}

export async function purchaseOffset(params: {
  userId: string
  flightId: string
  projectId: string
  amountCents: number
  bookingId?: string
}): Promise<OffsetCertificate> {
  return apiPost<OffsetCertificate>('/api/v1/carbon/purchase', params)
}

export async function getOffsetCertificate(purchaseId: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/v1/carbon/certificate/${purchaseId}`)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new ApiError(errorData.error?.message || `HTTP ${response.status}`, response.status)
  }
  return response.blob()
}

export async function getCarbonStats(userId: string): Promise<SustainabilityStats> {
  return apiGet<SustainabilityStats>(`/api/v1/carbon/stats?userId=${userId}`)
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
      const body = await authedFetch('/api/v1/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey || generateIdempotencyKey() },
        body: JSON.stringify({
          flightId: request.flightId,
          passenger: (request as any).passenger,
        }),
      })
      return { success: true, data: body.data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  submitSignedTransaction: async (bookingId: string, signedXdr: string) => {
    try {
      const body = await authedFetch(`/api/v1/bookings/${bookingId}/submit-onchain`, {
        method: 'POST',
        body: JSON.stringify({ signedXdr }),
      })
      return { success: true, data: body.data, soroban: body.soroban }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  getTransactionStatus: async (bookingId: string): Promise<ApiResult<BookingTransactionStatusResponse>> => {
    try {
      const body = await authedFetch(`/api/v1/bookings/${bookingId}/transaction-status`)
      return { success: true, data: body.data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  listTransactions: async (limit = 20): Promise<ApiResult<TransactionRecord[]>> => {
    try {
      const body = await authedFetch(`/api/v1/transactions?limit=${limit}`)
      return { success: true, data: body.data as TransactionRecord[] }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  retryTransaction: async (bookingId: string, signedXdr: string): Promise<ApiResult<TransactionRecord>> => {
    try {
      const body = await authedFetch(`/api/v1/transactions/${bookingId}/retry`, {
        method: 'POST',
        body: JSON.stringify({ signedXdr }),
      })
      return { success: true, data: body.data as TransactionRecord }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  getCheckInWindow: async (bookingId: string): Promise<ApiResult<CheckInWindow>> => {
    try {
      const body = await authedFetch(`/api/v1/checkin/${bookingId}/window`)
      return { success: true, data: body.data as CheckInWindow }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  checkIn: async (bookingId: string, seatNumber?: string): Promise<ApiResult<CheckInRecord>> => {
    try {
      const body = await authedFetch(`/api/v1/checkin/${bookingId}`, {
        method: 'POST',
        body: JSON.stringify(seatNumber ? { seatNumber } : {}),
      })
      return { success: true, data: body.data as CheckInRecord }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  getCheckIn: async (bookingId: string): Promise<ApiResult<CheckInRecord>> => {
    try {
      const body = await authedFetch(`/api/v1/checkin/${bookingId}`)
      return { success: true, data: body.data as CheckInRecord }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  reselectSeat: async (bookingId: string, seatNumber: string): Promise<ApiResult<CheckInRecord>> => {
    try {
      const body = await authedFetch(`/api/v1/checkin/${bookingId}/seat`, {
        method: 'PATCH',
        body: JSON.stringify({ seatNumber }),
      })
      return { success: true, data: body.data as CheckInRecord }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  getBoardingPassPdfUrl: (bookingId: string) => `${API_BASE_URL}/api/v1/checkin/${bookingId}/boarding-pass.pdf`,

  getWalletPass: async (bookingId: string): Promise<ApiResult<Record<string, unknown>>> => {
    try {
      const body = await authedFetch(`/api/v1/checkin/${bookingId}/wallet-pass`)
      return { success: true, data: body.data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
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

  getOffsetProjects: async (): Promise<ApiResult<OffsetProject[]>> => {
    try {
      const data = await getOffsetProjects()
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  estimateFootprint: async (flightId: string, cabinClass?: CarbonCabinClass): Promise<ApiResult<CarbonFootprint>> => {
    try {
      const data = await estimateFootprint(flightId, cabinClass)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  calculateOffsetCost: async (footprintKg: number, projectId: string): Promise<ApiResult<OffsetCost>> => {
    try {
      const data = await calculateOffsetCost(footprintKg, projectId)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  purchaseOffset: async (params: {
    userId: string
    flightId: string
    projectId: string
    amountCents: number
    bookingId?: string
  }): Promise<ApiResult<OffsetCertificate>> => {
    try {
      const data = await purchaseOffset(params)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  },

  getCarbonStats: async (userId: string): Promise<ApiResult<SustainabilityStats>> => {
    try {
      const data = await getCarbonStats(userId)
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: { message: error.message } }
    }
  }
}