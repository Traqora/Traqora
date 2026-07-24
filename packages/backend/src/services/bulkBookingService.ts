import { AppDataSource } from '../db/dataSource';
import { BulkBooking, BulkBookingType } from '../db/entities/BulkBooking';
import { Booking } from '../db/entities/Booking';
import { Flight } from '../db/entities/Flight';
import { BookingOrchestrationService } from './bookingOrchestrationService';
import { NotificationService } from './NotificationService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface BulkBookingRequest {
  name: string;
  type?: BulkBookingType;
  organizationName?: string;
  contactEmail?: string;
  contactPhone?: string;
  bookings: Array<{
    flightId: string;
    passenger: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string;
      sorobanAddress: string;
    };
  }>;
  metadata?: Record<string, any>;
  notes?: string;
}

export interface BulkBookingResult {
  bulkBooking: BulkBooking;
  successfulBookings: Booking[];
  failedBookings: Array<{ booking: BulkBookingRequest['bookings'][0]; error: string }>;
}

export class BulkBookingService {
  private static instance: BulkBookingService;
  private notificationService: NotificationService;
  private bookingOrchestrationService: BookingOrchestrationService;

  private constructor() {
    this.notificationService = NotificationService.getInstance();
    this.bookingOrchestrationService = new BookingOrchestrationService();
  }

  public static getInstance(): BulkBookingService {
    if (!BulkBookingService.instance) {
      BulkBookingService.instance = new BulkBookingService();
    }
    return BulkBookingService.instance;
  }

  /**
   * Create a bulk booking with multiple individual bookings
   */
  async createBulkBooking(request: BulkBookingRequest, idempotencyKey?: string): Promise<BulkBookingResult> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    const flightRepo = AppDataSource.getRepository(Flight);

    // Calculate total amount
    let totalAmountCents = 0;
    const flightIds = [...new Set(request.bookings.map((b: { flightId: string }) => b.flightId))];
    const flights = await flightRepo.findBy({ id: flightIds as any });
    const flightMap = new Map(flights.map((f: Flight) => [f.id, f]));

    for (const booking of request.bookings) {
      const flight = flightMap.get(booking.flightId) as Flight | undefined;
      if (!flight) {
        throw new Error(`Flight ${booking.flightId} not found`);
      }
      totalAmountCents += flight.priceCents;
    }

    // Create bulk booking record
    const bulkBooking = bulkBookingRepo.create({
      idempotencyKey,
      name: request.name,
      type: request.type || 'custom',
      status: 'pending',
      totalBookings: request.bookings.length,
      completedBookings: 0,
      failedBookings: 0,
      totalAmountCents,
      processedAmountCents: 0,
      organizationName: request.organizationName,
      contactEmail: request.contactEmail,
      contactPhone: request.contactPhone,
      metadata: request.metadata,
      notes: request.notes,
    });

    const savedBulkBooking = await bulkBookingRepo.save(bulkBooking);

    // Process bookings
    const successfulBookings: Booking[] = [];
    const failedBookings: Array<{ booking: BulkBookingRequest['bookings'][0]; error: string }> = [];

    bulkBooking.status = 'processing';
    await bulkBookingRepo.save(bulkBooking);

    for (const bookingRequest of request.bookings) {
      try {
        const booking = await this.processIndividualBooking(
          bookingRequest,
          savedBulkBooking.id,
          idempotencyKey
        );
        successfulBookings.push(booking);
        savedBulkBooking.completedBookings++;
        savedBulkBooking.processedAmountCents += booking.amountCents;
      } catch (error: any) {
        logger.error(`Failed to process booking for ${bookingRequest.passenger.email}`, error);
        failedBookings.push({
          booking: bookingRequest,
          error: error.message || 'Unknown error',
        });
        savedBulkBooking.failedBookings++;
      }
    }

    // Update final status
    if (failedBookings.length === 0) {
      savedBulkBooking.status = 'completed';
    } else if (successfulBookings.length === 0) {
      savedBulkBooking.status = 'failed';
      savedBulkBooking.failureReason = 'All bookings failed';
    } else {
      savedBulkBooking.status = 'partial_completed';
      savedBulkBooking.failureReason = `${failedBookings.length} out of ${request.bookings.length} bookings failed`;
    }

    await bulkBookingRepo.save(savedBulkBooking);

    // Send notification
    await this.sendBulkBookingNotification(savedBulkBooking, successfulBookings.length, failedBookings.length);

    logger.info(`Bulk booking ${savedBulkBooking.id} completed: ${successfulBookings.length} successful, ${failedBookings.length} failed`);

    return {
      bulkBooking: savedBulkBooking,
      successfulBookings,
      failedBookings,
    };
  }

  /**
   * Process an individual booking as part of a bulk booking
   */
  private async processIndividualBooking(
    bookingRequest: BulkBookingRequest['bookings'][0],
    bulkBookingId: string,
    idempotencyKey?: string
  ): Promise<Booking> {
    const bookingIdempotencyKey = idempotencyKey 
      ? `${idempotencyKey}_${bookingRequest.passenger.email}_${bookingRequest.flightId}`
      : uuidv4();

    const booking = await this.bookingOrchestrationService.createBooking({
      flightId: bookingRequest.flightId,
      passenger: bookingRequest.passenger,
      idempotencyKey: bookingIdempotencyKey,
    });

    // Link to bulk booking
    const bookingRepo = AppDataSource.getRepository(Booking);
    booking.bulkBookingId = bulkBookingId;
    await bookingRepo.save(booking);

    return booking;
  }

  /**
   * Get bulk booking by ID
   */
  async getBulkBooking(bulkBookingId: string): Promise<BulkBooking | null> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    return await bulkBookingRepo.findOne({
      where: { id: bulkBookingId },
      relations: ['bookings', 'bookings.flight', 'bookings.passenger'],
    });
  }

  /**
   * Get all bulk bookings for an organization
   */
  async getBulkBookingsByOrganization(organizationName: string): Promise<BulkBooking[]> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    return await bulkBookingRepo.find({
      where: { organizationName, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get bulk bookings by contact email
   */
  async getBulkBookingsByEmail(email: string): Promise<BulkBooking[]> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    return await bulkBookingRepo.find({
      where: { contactEmail: email, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Cancel a bulk booking (only if not completed)
   */
  async cancelBulkBooking(bulkBookingId: string, reason: string): Promise<BulkBooking> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    const bookingRepo = AppDataSource.getRepository(Booking);

    const bulkBooking = await bulkBookingRepo.findOne({
      where: { id: bulkBookingId },
      relations: ['bookings'],
    });

    if (!bulkBooking) {
      throw new Error('Bulk booking not found');
    }

    if (bulkBooking.status === 'completed' || bulkBooking.status === 'cancelled') {
      throw new Error('Cannot cancel a completed or already cancelled bulk booking');
    }

    // Cancel all associated bookings
    for (const booking of bulkBooking.bookings) {
      if (booking.status !== 'confirmed' && booking.status !== 'paid') {
        booking.status = 'failed';
        booking.lastError = `Bulk booking cancelled: ${reason}`;
        await bookingRepo.save(booking);
      }
    }

    bulkBooking.status = 'cancelled';
    bulkBooking.failureReason = reason;
    await bulkBookingRepo.save(bulkBooking);

    // Send cancellation notification
    if (bulkBooking.contactEmail) {
      await this.notificationService.sendEmail(
        bulkBooking.contactEmail,
        `Bulk booking cancelled: ${bulkBooking.name}`,
        `
          <h2>Bulk Booking Cancelled</h2>
          <p>Your bulk booking <strong>${bulkBooking.name}</strong> has been cancelled.</p>
          <p>Reason: ${reason}</p>
          <p>Total bookings affected: ${bulkBooking.totalBookings}</p>
        `
      );
    }

    logger.info(`Bulk booking ${bulkBookingId} cancelled: ${reason}`);

    return bulkBooking;
  }

  /**
   * Retry failed bookings in a bulk booking
   */
  async retryFailedBookings(bulkBookingId: string): Promise<BulkBookingResult> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    const bookingRepo = AppDataSource.getRepository(Booking);

    const bulkBooking = await bulkBookingRepo.findOne({
      where: { id: bulkBookingId },
      relations: ['bookings', 'bookings.flight', 'bookings.passenger'],
    });

    if (!bulkBooking) {
      throw new Error('Bulk booking not found');
    }

    if (bulkBooking.status === 'completed' || bulkBooking.status === 'cancelled') {
      throw new Error('Cannot retry a completed or cancelled bulk booking');
    }

    const failedBookings = bulkBooking.bookings.filter((b: Booking) => b.status === 'failed');
    const successfulBookings: Booking[] = [];
    const stillFailedBookings: Array<{ booking: Booking; error: string }> = [];

    for (const failedBooking of failedBookings) {
      try {
        // Create new booking attempt
        const newBooking = await this.bookingOrchestrationService.createBooking({
          flightId: failedBooking.flight.id,
          passenger: {
            email: failedBooking.passenger.email,
            firstName: failedBooking.passenger.firstName,
            lastName: failedBooking.passenger.lastName,
            phone: failedBooking.passenger.phone || undefined,
            sorobanAddress: failedBooking.passenger.sorobanAddress,
          },
          idempotencyKey: `retry_${bulkBookingId}_${failedBooking.id}_${Date.now()}`,
        });

        newBooking.bulkBookingId = bulkBookingId;
        await bookingRepo.save(newBooking);

        // Mark old booking as replaced
        failedBooking.lastError = 'Replaced by retry';
        await bookingRepo.save(failedBooking);

        successfulBookings.push(newBooking);
        bulkBooking.completedBookings++;
        bulkBooking.failedBookings--;
        bulkBooking.processedAmountCents += newBooking.amountCents;
      } catch (error: any) {
        logger.error(`Retry failed for booking ${failedBooking.id}`, error);
        stillFailedBookings.push({
          booking: failedBooking,
          error: error.message || 'Unknown error',
        });
      }
    }

    // Update status
    if (bulkBooking.failedBookings === 0) {
      bulkBooking.status = 'completed';
    } else {
      bulkBooking.status = 'partial_completed';
    }

    await bulkBookingRepo.save(bulkBooking);

    return {
      bulkBooking,
      successfulBookings,
      failedBookings: stillFailedBookings,
    };
  }

  /**
   * Get bulk booking statistics
   */
  async getBulkBookingStats(organizationName?: string): Promise<{
    total: number;
    completed: number;
    partial: number;
    failed: number;
    pending: number;
  }> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);

    const whereCondition = organizationName 
      ? { organizationName, isDeleted: false }
      : { isDeleted: false };

    const allBookings = await bulkBookingRepo.find({ where: whereCondition });

    return {
      total: allBookings.length,
      completed: allBookings.filter((b: BulkBooking) => b.status === 'completed').length,
      partial: allBookings.filter((b: BulkBooking) => b.status === 'partial_completed').length,
      failed: allBookings.filter((b: BulkBooking) => b.status === 'failed').length,
      pending: allBookings.filter((b: BulkBooking) => b.status === 'pending' || b.status === 'processing').length,
    };
  }

  /**
   * Send notification about bulk booking completion
   */
  private async sendBulkBookingNotification(
    bulkBooking: BulkBooking,
    successfulCount: number,
    failedCount: number
  ): Promise<void> {
    if (!bulkBooking.contactEmail) {
      return;
    }

    const subject = `Bulk booking ${bulkBooking.status}: ${bulkBooking.name}`;
    const body = `
      <h2>Bulk Booking ${bulkBooking.status}</h2>
      <p>Your bulk booking <strong>${bulkBooking.name}</strong> has been processed.</p>
      <p><strong>Results:</strong></p>
      <ul>
        <li>Successful bookings: ${successfulCount}</li>
        <li>Failed bookings: ${failedCount}</li>
        <li>Total amount: $${(bulkBooking.processedAmountCents / 100).toFixed(2)}</li>
      </ul>
      ${failedCount > 0 ? '<p>You can retry failed bookings from the dashboard.</p>' : ''}
    `;

    await this.notificationService.sendEmail(bulkBooking.contactEmail, subject, body);
  }

  /**
   * Delete a bulk booking (soft delete)
   */
  async deleteBulkBooking(bulkBookingId: string): Promise<void> {
    const bulkBookingRepo = AppDataSource.getRepository(BulkBooking);
    const bulkBooking = await bulkBookingRepo.findOne({ where: { id: bulkBookingId } });

    if (!bulkBooking) {
      throw new Error('Bulk booking not found');
    }

    bulkBooking.isDeleted = true;
    await bulkBookingRepo.save(bulkBooking);

    logger.info(`Bulk booking ${bulkBookingId} soft deleted`);
  }
}
