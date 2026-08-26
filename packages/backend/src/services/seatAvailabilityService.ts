/**
 * Seat Availability and Management Service
 * Handles seat maps, real-time availability, and seat locking
 */

import { AppDataSource } from "../db/dataSource";
import { Booking } from "../db/entities/Booking";
import { Flight } from "../db/entities/Flight";
import { logger } from "../utils/logger";
import { BadRequestError, NotFoundError } from "../utils/errors";
import type { SeatType, SeatAvailability } from "../types/services";

const SEAT_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const AIRCRAFT_CONFIG: Record<
  string,
  { rows: number; cols: string[]; classMap: Record<number, SeatType> }
> = {
  DEFAULT: {
    rows: 20,
    cols: ["A", "B", "C", "D", "E", "F"],
    classMap: {
      1: "first",
      2: "first",
      3: "business",
      4: "business",
      5: "business",
      6: "premium_economy",
      7: "premium_economy",
      8: "premium_economy",
      // 9-20 = economy
    },
  },
};

interface SeatLock {
  bookingId: string;
  seatNumber: string;
  lockedAt: Date;
  expiresAt: Date;
}

// In-memory seat lock storage (in production, use Redis)
const seatLocks: Map<string, Map<string, SeatLock>> = new Map();

export class SeatAvailabilityService {
  /**
   * Get seat availability map for a flight
   */
  async getSeatAvailability(
    flightId: string,
    _cabinClass?: SeatType,
  ): Promise<SeatAvailability> {
    await this.getFlightOrThrow(flightId);
    const config = AIRCRAFT_CONFIG.DEFAULT;

    // Get all booked seats for this flight
    const bookings = await AppDataSource.getRepository(Booking).find({
      where: { flight: { id: flightId } },
    });

    const occupiedSeats = new Set<string>();
    bookings.forEach((b) => {
      const metadata = (b as any).metadata ?? {};
      if (metadata.seatNumber) {
        occupiedSeats.add(metadata.seatNumber);
      }
    });

    // Build seat map
    const seatMap: SeatAvailability["seatMap"] = {};

    for (let row = 1; row <= config.rows; row++) {
      seatMap[row] = {};

      for (const col of config.cols) {
        const seatNumber = `${row}${col}`;
        const seatType = this.getSeatType(row, config.classMap);
        const isOccupied = occupiedSeats.has(seatNumber);
        const seatLock = this.getSeatLock(flightId, seatNumber);

        // Determine price based on cabin class
        const price = this.calculateSeatPrice(seatType);

        seatMap[row][col] = {
          available: !isOccupied && !seatLock,
          type: seatType,
          price,
          ...(seatLock && {
            locked: { until: seatLock.expiresAt, by: seatLock.bookingId },
          }),
        };
      }
    }

    const availableSeats = Object.values(seatMap).reduce(
      (count, row) =>
        count + Object.values(row).filter((s) => s.available).length,
      0,
    );

    return {
      flightId,
      totalSeats: config.rows * config.cols.length,
      occupiedSeats: occupiedSeats.size,
      availableSeats,
      seatMap,
      timestamp: new Date(),
    };
  }

  /**
   * Lock a seat (temporary reservation, expires after 15 minutes)
   */
  async lockSeat(
    flightId: string,
    seatNumber: string,
    bookingId: string,
  ): Promise<void> {
    // Validate seat number format
    if (!/^\d{1,2}[A-F]$/.test(seatNumber)) {
      throw new BadRequestError(`Invalid seat number format: ${seatNumber}`);
    }

    // Check if seat already locked
    const existingLock = this.getSeatLock(flightId, seatNumber);
    if (existingLock && existingLock.bookingId !== bookingId) {
      throw new BadRequestError(
        `Seat ${seatNumber} is locked by another booking`,
      );
    }

    // Check if seat is occupied
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { flight: { id: flightId } },
    });

    if (booking && (booking as any).metadata?.seatNumber === seatNumber) {
      throw new BadRequestError(`Seat ${seatNumber} is already occupied`);
    }

    // Create lock
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SEAT_LOCK_DURATION_MS);

    if (!seatLocks.has(flightId)) {
      seatLocks.set(flightId, new Map());
    }

    seatLocks.get(flightId)!.set(seatNumber, {
      bookingId,
      seatNumber,
      lockedAt: now,
      expiresAt,
    });

    logger.info("Seat locked", { flightId, seatNumber, bookingId, expiresAt });
  }

  /**
   * Release a seat lock
   */
  async releaseSeatLock(
    flightId: string,
    seatNumber: string,
    bookingId: string,
  ): Promise<void> {
    const lock = this.getSeatLock(flightId, seatNumber);

    if (!lock) {
      logger.warn("Attempted to release non-existent lock", {
        flightId,
        seatNumber,
        bookingId,
      });
      return;
    }

    if (lock.bookingId !== bookingId) {
      throw new BadRequestError("Cannot release lock owned by another booking");
    }

    seatLocks.get(flightId)?.delete(seatNumber);
    logger.info("Seat lock released", { flightId, seatNumber, bookingId });
  }

  /**
   * Select a seat for a booking
   */
  async selectSeat(
    bookingId: string,
    flightId: string,
    seatNumber: string,
    seatPrice: number,
    preference?: string,
  ): Promise<void> {
    // Validate seat
    if (!/^\d{1,2}[A-F]$/.test(seatNumber)) {
      throw new BadRequestError(`Invalid seat number format: ${seatNumber}`);
    }

    const booking = await this.getBookingOrThrow(bookingId);

    // Check if seat is available
    const availability = await this.getSeatAvailability(flightId);
    const [rowStr, col] = [seatNumber.slice(0, -1), seatNumber.slice(-1)];
    const row = parseInt(rowStr);

    if (!availability.seatMap[row] || !availability.seatMap[row][col]) {
      throw new BadRequestError(`Invalid seat location: ${seatNumber}`);
    }

    const seatInfo = availability.seatMap[row][col];
    if (!seatInfo.available) {
      throw new BadRequestError(`Seat ${seatNumber} is not available`);
    }

    // Update booking with seat selection
    const metadata = (booking as any).metadata ?? {};
    metadata.seatNumber = seatNumber;
    metadata.seatType = seatInfo.type;
    metadata.seatPrice = seatPrice;
    metadata.seatPreference = preference ?? null;
    metadata.seatSelectedAt = new Date().toISOString();

    (booking as any).metadata = metadata;
    await AppDataSource.getRepository(Booking).save(booking);

    logger.info("Seat selected", {
      bookingId,
      flightId,
      seatNumber,
      price: seatPrice,
    });
  }

  /**
   * Get available seats for a specific cabin class
   */
  async getAvailableSeatsByClass(
    flightId: string,
    cabinClass: SeatType,
  ): Promise<Array<{ seatNumber: string; price: number }>> {
    const availability = await this.getSeatAvailability(flightId, cabinClass);

    const availableSeats: Array<{ seatNumber: string; price: number }> = [];

    for (const [rowStr, row] of Object.entries(availability.seatMap)) {
      for (const [col, seat] of Object.entries(row)) {
        if (seat.type === cabinClass && seat.available) {
          availableSeats.push({
            seatNumber: `${rowStr}${col}`,
            price: seat.price,
          });
        }
      }
    }

    return availableSeats;
  }

  /**
   * Validate seat selection against flight
   */
  async validateSeatForBooking(
    bookingId: string,
    seatNumber: string,
  ): Promise<boolean> {
    const booking = await this.getBookingOrThrow(bookingId);
    const availability = await this.getSeatAvailability(booking.flight.id);

    const [rowStr, col] = [seatNumber.slice(0, -1), seatNumber.slice(-1)];
    const row = parseInt(rowStr);

    if (!availability.seatMap[row] || !availability.seatMap[row][col]) {
      return false;
    }

    return availability.seatMap[row][col].available;
  }

  /**
   * Cleanup expired seat locks (should run periodically)
   */
  async cleanupExpiredLocks(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [flightId, locks] of seatLocks) {
      for (const [seatNumber, lock] of locks) {
        if (lock.expiresAt < now) {
          locks.delete(seatNumber);
          cleanedCount++;
        }
      }

      if (locks.size === 0) {
        seatLocks.delete(flightId);
      }
    }

    if (cleanedCount > 0) {
      logger.info("Cleaned up expired seat locks", { count: cleanedCount });
    }

    return cleanedCount;
  }

  /**
   * Helper: Get seat type based on row
   */
  private getSeatType(
    row: number,
    classMap: Record<number, SeatType>,
  ): SeatType {
    return classMap[row] || "economy";
  }

  /**
   * Helper: Calculate seat price based on class
   */
  private calculateSeatPrice(seatType: SeatType): number {
    switch (seatType) {
      case "first":
        return 15000; // $150
      case "business":
        return 8000; // $80
      case "premium_economy":
        return 4000; // $40
      default:
        return 1500; // $15
    }
  }

  /**
   * Helper: Get seat lock from storage
   */
  private getSeatLock(
    flightId: string,
    seatNumber: string,
  ): SeatLock | undefined {
    const lock = seatLocks.get(flightId)?.get(seatNumber);

    // Check if lock expired
    if (lock && lock.expiresAt < new Date()) {
      seatLocks.get(flightId)?.delete(seatNumber);
      return undefined;
    }

    return lock;
  }

  /**
   * Helper: Get flight or throw
   */
  private async getFlightOrThrow(flightId: string): Promise<Flight> {
    const flight = await AppDataSource.getRepository(Flight).findOne({
      where: { id: flightId },
    });

    if (!flight) {
      throw new NotFoundError("Flight not found");
    }

    return flight;
  }

  /**
   * Helper: Get booking or throw
   */
  private async getBookingOrThrow(bookingId: string): Promise<Booking> {
    const booking = await AppDataSource.getRepository(Booking).findOne({
      where: { id: bookingId },
      relations: ["flight"],
    });

    if (!booking) {
      throw new NotFoundError("Booking not found");
    }

    return booking;
  }
}

export const seatAvailabilityService = new SeatAvailabilityService();
