import { Flight } from '../db/entities/Flight';
import { Booking, BookingStatus } from '../db/entities/Booking';
import { CheckIn } from '../db/entities/CheckIn';
import { Passenger } from '../db/entities/Passenger';
import { User } from '../db/entities/User';
import { buildRealisticFlightFixtures } from './realisticFlightFixtures';

export interface MockFlightParams {
  id?: string;
  flightNumber?: string;
  airlineCode?: string;
  fromAirport?: string;
  toAirport?: string;
  departureTime?: Date;
  arrivalTime?: Date;
  priceCents?: number;
  seatsAvailable?: number;
  status?: string;
  gate?: string;
  terminal?: string;
}

export interface MockPassengerParams {
  id?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  sorobanAddress?: string;
}

export interface MockBookingParams {
  id?: string;
  flight?: Flight;
  passenger?: Passenger;
  status?: BookingStatus;
  amountCents?: number;
  sorobanBookingId?: string;
}

export interface MockCheckInParams {
  id?: string;
  booking?: Booking;
  status?: 'pending' | 'checked_in' | 'cancelled';
  seatNumber?: string;
  boardingPassCode?: string;
  checkedInAt?: Date;
}

export interface MockJourneyParams {
  id?: string;
  title?: string;
  userId?: string;
  stops?: Array<{
    city: string;
    airportCode: string;
    arrivalDate: string;
    departureDate: string;
    activities?: string[];
  }>;
  shareToken?: string;
  isPublic?: boolean;
}

export class MockFactories {
  static createFlight(params: MockFlightParams = {}): Flight {
    const flight = new Flight();
    flight.id = params.id || 'f1111111-1111-4111-a111-111111111111';
    flight.flightNumber = params.flightNumber || 'TQ101';
    flight.airlineCode = params.airlineCode || 'TQ';
    flight.fromAirport = params.fromAirport || 'JFK';
    flight.toAirport = params.toAirport || 'LHR';
    const now = Date.now();
    flight.departureTime = params.departureTime || new Date(now + 12 * 60 * 60 * 1000);
    flight.arrivalTime = params.arrivalTime || new Date(now + 20 * 60 * 60 * 1000);
    flight.priceCents = params.priceCents || 45000;
    flight.seatsAvailable = params.seatsAvailable ?? 120;
    flight.status = params.status || 'SCHEDULED';
    flight.gate = params.gate || 'B12';
    flight.terminal = params.terminal || 'T4';
    return flight;
  }

  static createPassenger(params: MockPassengerParams = {}): Passenger {
    const passenger = new Passenger();
    passenger.id = params.id || 'p2222222-2222-4222-a222-222222222222';
    passenger.firstName = params.firstName || 'Jane';
    passenger.lastName = params.lastName || 'Doe';
    passenger.email = params.email || 'jane.doe@example.com';
    passenger.phone = params.phone || '+1234567890';
    passenger.sorobanAddress = params.sorobanAddress || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    return passenger;
  }

  static createBooking(params: MockBookingParams = {}): Booking {
    const booking = new Booking();
    booking.id = params.id || 'b3333333-3333-4333-a333-333333333333';
    booking.flight = params.flight || this.createFlight();
    booking.passenger = params.passenger || this.createPassenger();
    booking.status = params.status || 'confirmed';
    booking.amountCents = params.amountCents || booking.flight.priceCents;
    booking.sorobanBookingId = params.sorobanBookingId || '12345';
    return booking;
  }

  static createCheckIn(params: MockCheckInParams = {}): CheckIn {
    const checkIn = new CheckIn();
    checkIn.id = params.id || 'c4444444-4444-4444-a444-444444444444';
    checkIn.booking = params.booking || this.createBooking();
    checkIn.status = params.status || 'checked_in';
    checkIn.seatNumber = params.seatNumber || '14A';
    checkIn.boardingPassCode = params.boardingPassCode || 'BP-TQ101-JANE-DOE-14A';
    checkIn.checkedInAt = params.checkedInAt || new Date();
    return checkIn;
  }

  static createUser(params: Partial<User> = {}): User {
    const user = new User();
    user.walletAddress = params.walletAddress || 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    user.walletType = params.walletType || 'freighter';
    return user;
  }

  static createRealisticFlights(): Flight[] {
    return buildRealisticFlightFixtures().map((fixture) =>
      this.createFlight({
        id: fixture.id,
        flightNumber: fixture.flightNumber,
        airlineCode: fixture.airlineCode,
        fromAirport: fixture.fromAirport,
        toAirport: fixture.toAirport,
        departureTime: fixture.departureTime,
        arrivalTime: fixture.arrivalTime,
        priceCents: fixture.priceCents,
        seatsAvailable: fixture.seatsAvailable,
        status: fixture.status,
        gate: fixture.gate,
        terminal: fixture.terminal,
      })
    );
  }

  static createMLHistoricalData(count: number = 30) {
    return Array.from({ length: count }, (_, i) => ({
      date: new Date(2026, 0, i + 1).toISOString(),
      value: 1000 + i * 50 + Math.sin(i) * 100,
      revenue: 1000 + i * 50 + Math.sin(i) * 100,
    }));
  }

  static createMLUserProfile(params: Record<string, any> = {}) {
    return {
      id: 'u-ml-1',
      daysSinceLastBooking: 45,
      totalBookings: 8,
      totalRevenue: 3400,
      avgBookingValue: 425,
      refundRate: 0.05,
      supportTickets30d: 1,
      loyaltyTier: 'gold',
      preferredAirlines: ['TQ', 'BA'],
      preferredRoutes: ['JFK-LHR', 'LHR-CDG'],
      avgTicketPrice: 450,
      ...params,
    };
  }
}