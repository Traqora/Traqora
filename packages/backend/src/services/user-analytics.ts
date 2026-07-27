import { AppDataSource } from '../db/dataSource';
import { Booking } from '../db/entities/Booking';
import { Passenger } from '../db/entities/Passenger';
import { Repository } from 'typeorm';

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

export interface RevenueMetrics {
  daily: { date: string; revenue: number }[];
  weekly: { date: string; revenue: number }[];
  monthly: { date: string; revenue: number }[];
  total: number;
  growth: number;
}

export interface UserMetrics {
  totalUsers: number;
  activeUsers: number;
  newRegistrations: { date: string; count: number }[];
  retention: number;
  engagement: number;
}

export interface BookingAnalytics {
  totalBookings: number;
  popularRoutes: { route: string; count: number }[];
  popularAirlines: { airline: string; count: number }[];
  averageBookingValue: number;
  cancellationRate: number;
}

export interface SystemHealthMetrics {
  apiLatency: number;
  errorRate: number;
  activeConnections: number;
  databaseHealth: 'healthy' | 'degraded' | 'down';
  redisHealth: 'healthy' | 'degraded' | 'down';
}

export class UserAnalyticsService {
  private bookingRepo: Repository<Booking>;
  private passengerRepo: Repository<Passenger>;

  constructor() {
    this.bookingRepo = AppDataSource.getRepository(Booking);
    this.passengerRepo = AppDataSource.getRepository(Passenger);
  }

  async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    // Get user's bookings
    const bookings = await this.bookingRepo.find({
      where: { passenger: { id: userId } },
      relations: ['flight'],
      order: { createdAt: 'DESC' },
      take: 50,
    });

    const bookingHistory: BookingHistoryItem[] = bookings.map((booking: any) => ({
      id: booking.id,
      date: booking.createdAt.toISOString().split('T')[0],
      route: `${booking.flight.fromAirport} → ${booking.flight.toAirport}`,
      amount: booking.amountCents / 100,
      pointsEarned: Math.floor(booking.amountCents / 10),
      status: booking.status === 'confirmed' ? 'completed' : 
              booking.status === 'failed' ? 'cancelled' : 'upcoming',
    }));

    // Calculate spending breakdown by month
    const spendingByMonth = new Map<string, number>();
    bookings.forEach((booking: any) => {
      const month = booking.createdAt.toISOString().slice(0, 7);
      spendingByMonth.set(month, (spendingByMonth.get(month) || 0) + booking.amountCents / 100);
    });

    const spendingBreakdown: SpendingData[] = Array.from(spendingByMonth.entries())
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate travel stats
    const totalFlights = bookings.length;
    const uniqueRoutes = new Set(bookings.map((b: any) => `${b.flight.fromAirport}-${b.flight.toAirport}`));
    const totalAmount = bookings.reduce((sum: number, b: any) => sum + b.amountCents, 0) / 100;

    const travelStats: TravelStat[] = [
      { label: 'Total Flights', value: totalFlights, unit: 'flights' },
      { label: 'Unique Routes', value: uniqueRoutes.size, unit: 'routes' },
      { label: 'Total Spent', value: totalAmount, unit: 'USD' },
      { label: 'Points Earned', value: Math.floor(totalAmount * 10), unit: 'points' },
    ];

    // Mock carbon footprint (would be calculated from flight distances)
    const carbonFootprint: CarbonFootprint = {
      total: totalFlights * 0.5,
      offset: totalFlights * 0.2,
      monthly: spendingBreakdown.map(s => ({
        month: s.month,
        emissions: s.amount * 0.001,
        offset: s.amount * 0.0004,
      })),
    };

    return {
      bookingHistory,
      spendingBreakdown,
      travelStats,
      carbonFootprint,
    };
  }

  async getRevenueMetrics(period: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<RevenueMetrics> {
    const bookings = await this.bookingRepo.find({
      where: { status: 'confirmed' },
      order: { createdAt: 'DESC' },
    });

    const revenueByPeriod = new Map<string, number>();
    
    bookings.forEach((booking: any) => {
      const date = booking.createdAt;
      let key: string;
      
      if (period === 'daily') {
        key = date.toISOString().split('T')[0];
      } else if (period === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
      } else {
        key = date.toISOString().slice(0, 7);
      }
      
      revenueByPeriod.set(key, (revenueByPeriod.get(key) || 0) + booking.amountCents / 100);
    });

    const sortedData = Array.from(revenueByPeriod.entries())
      .map(([key, revenue]) => ({ date: key, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    const total = bookings.reduce((sum: number, b: any) => sum + b.amountCents, 0) / 100;
    const previousTotal = sortedData.length > 1 
      ? sortedData.slice(0, -1).reduce((sum: number, d: any) => sum + d.revenue, 0)
      : total;
    const growth = previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : 0;

    return {
      daily: period === 'daily' ? sortedData : [],
      weekly: period === 'weekly' ? sortedData : [],
      monthly: period === 'monthly' ? sortedData : [],
      total,
      growth,
    };
  }

  async getUserMetrics(): Promise<UserMetrics> {
    const totalUsers = await this.passengerRepo.count();
    
    // Get active users (bookings in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const activeUsers = await this.bookingRepo
      .createQueryBuilder('booking')
      .select('COUNT(DISTINCT booking.passengerId)')
      .where('booking.createdAt >= :date', { date: thirtyDaysAgo })
      .getRawOne();

    // Get new registrations by day
    const newUsers = await this.passengerRepo
      .createQueryBuilder('passenger')
      .select("DATE_FORMAT(passenger.createdAt, '%Y-%m-%d')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('passenger.createdAt >= :date', { date: thirtyDaysAgo })
      .groupBy("DATE_FORMAT(passenger.createdAt, '%Y-%m-%d')")
      .orderBy('date', 'ASC')
      .getRawMany();

    const newRegistrations = newUsers.map((n: any) => ({
      date: n.date,
      count: parseInt(n.count),
    }));

    return {
      totalUsers,
      activeUsers: parseInt(activeUsers.count || '0'),
      newRegistrations,
      retention: 75, // Mock value
      engagement: 68, // Mock value
    };
  }

  async getBookingAnalytics(): Promise<BookingAnalytics> {
    const bookings = await this.bookingRepo.find({ relations: ['flight'] });
    
    const totalBookings = bookings.length;
    const averageBookingValue = bookings.length > 0
      ? bookings.reduce((sum: number, b: any) => sum + b.amountCents, 0) / bookings.length / 100
      : 0;

    // Calculate popular routes
    const routeCounts = new Map<string, number>();
    bookings.forEach((booking: any) => {
      const route = `${booking.flight.fromAirport} → ${booking.flight.toAirport}`;
      routeCounts.set(route, (routeCounts.get(route) || 0) + 1);
    });

    const popularRoutes = Array.from(routeCounts.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate popular airlines
    const airlineCounts = new Map<string, number>();
    bookings.forEach((booking: any) => {
      const airline = booking.flight.airline;
      airlineCounts.set(airline, (airlineCounts.get(airline) || 0) + 1);
    });

    const popularAirlines = Array.from(airlineCounts.entries())
      .map(([airline, count]) => ({ airline, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const cancelledBookings = bookings.filter((b: any) => b.status === 'refunded' || b.status === 'failed');
    const cancellationRate = totalBookings > 0 ? (cancelledBookings.length / totalBookings) * 100 : 0;

    return {
      totalBookings,
      popularRoutes,
      popularAirlines,
      averageBookingValue,
      cancellationRate,
    };
  }

  async getSystemHealthMetrics(): Promise<SystemHealthMetrics> {
    // Mock implementation - would integrate with monitoring system
    return {
      apiLatency: 45, // ms
      errorRate: 0.02, // 2%
      activeConnections: 156,
      databaseHealth: 'healthy',
      redisHealth: 'healthy',
    };
  }
}