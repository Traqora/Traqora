export interface BookingHistoryItem {
  id: string
  date: string
  route: string
  amount: number
  pointsEarned: number
  status: 'completed' | 'upcoming' | 'cancelled'
}

export interface SpendingData {
  month: string
  amount: number
}

export interface TravelStat {
  label: string
  value: number
  unit: string
}

export interface CarbonFootprint {
  total: number
  offset: number
  monthly: { month: string; emissions: number; offset: number }[]
}

export interface UserAnalytics {
  bookingHistory: BookingHistoryItem[]
  spendingBreakdown: SpendingData[]
  travelStats: TravelStat[]
  carbonFootprint: CarbonFootprint
}

export class UserAnalyticsService {
  async getUserAnalytics(_userId: string): Promise<UserAnalytics> {
    // TODO: Replace with real DB/aggregation queries
    return {
      bookingHistory: [],
      spendingBreakdown: [],
      travelStats: [
        { label: 'Total Miles Flown', value: 0, unit: 'miles' },
        { label: 'Countries Visited', value: 0, unit: 'countries' },
        { label: 'Total Flights', value: 0, unit: 'flights' },
        { label: 'Airports Visited', value: 0, unit: 'airports' },
      ],
      carbonFootprint: {
        total: 0,
        offset: 0,
        monthly: [],
      },
    }
  }
}