import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { BulkBookingService } from '../bulkBookingService';
import { AppDataSource } from '../../db/dataSource';
import { BulkBooking } from '../../db/entities/BulkBooking';
import { Flight } from '../../db/entities/Flight';

describe('BulkBookingService', () => {
  let bulkBookingService: BulkBookingService;

  beforeEach(() => {
    bulkBookingService = BulkBookingService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createBulkBooking', () => {
    it('should create a bulk booking with valid request', async () => {
      const request = {
        name: 'Test Bulk Booking',
        type: 'corporate' as const,
        organizationName: 'Test Corp',
        contactEmail: 'test@example.com',
        bookings: [
          {
            flightId: 'flight-1',
            passenger: {
              email: 'passenger1@example.com',
              firstName: 'John',
              lastName: 'Doe',
              sorobanAddress: 'GABCD...',
            },
          },
        ],
      };

      const mockFlight = {
        id: 'flight-1',
        priceCents: 10000,
      } as Flight;

      jest.spyOn(AppDataSource.getRepository(Flight), 'findBy').mockResolvedValue([mockFlight]);
      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'create').mockReturnValue({
        id: 'bulk-1',
        ...request,
        totalBookings: 1,
        totalAmountCents: 10000,
        completedBookings: 0,
        failedBookings: 0,
        processedAmountCents: 0,
        status: 'pending',
      } as BulkBooking);
      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'save').mockResolvedValue({
        id: 'bulk-1',
        ...request,
        totalBookings: 1,
        totalAmountCents: 10000,
        completedBookings: 0,
        failedBookings: 0,
        processedAmountCents: 0,
        status: 'pending',
      } as BulkBooking);

      const result = await bulkBookingService.createBulkBooking(request);

      expect(result).toBeDefined();
      expect(result.bulkBooking.name).toBe(request.name);
      expect(result.bulkBooking.totalBookings).toBe(1);
    });

    it('should throw error if flight not found', async () => {
      const request = {
        name: 'Test Bulk Booking',
        bookings: [
          {
            flightId: 'non-existent-flight',
            passenger: {
              email: 'passenger1@example.com',
              firstName: 'John',
              lastName: 'Doe',
              sorobanAddress: 'GABCD...',
            },
          },
        ],
      };

      jest.spyOn(AppDataSource.getRepository(Flight), 'findBy').mockResolvedValue([]);

      await expect(bulkBookingService.createBulkBooking(request)).rejects.toThrow(
        'Flight non-existent-flight not found'
      );
    });
  });

  describe('getBulkBooking', () => {
    it('should return bulk booking by id', async () => {
      const mockBulkBooking = {
        id: 'bulk-1',
        name: 'Test Bulk Booking',
        status: 'completed',
        totalBookings: 5,
        completedBookings: 5,
        failedBookings: 0,
      } as BulkBooking;

      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'findOne').mockResolvedValue(mockBulkBooking);

      const result = await bulkBookingService.getBulkBooking('bulk-1');

      expect(result).toEqual(mockBulkBooking);
    });

    it('should return null if bulk booking not found', async () => {
      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'findOne').mockResolvedValue(null);

      const result = await bulkBookingService.getBulkBooking('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('cancelBulkBooking', () => {
    it('should cancel a bulk booking', async () => {
      const mockBulkBooking = {
        id: 'bulk-1',
        name: 'Test Bulk Booking',
        status: 'pending',
        totalBookings: 5,
      } as BulkBooking;

      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'findOne').mockResolvedValue(mockBulkBooking);
      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'save').mockResolvedValue({
        ...mockBulkBooking,
        status: 'cancelled',
        failureReason: 'Test cancellation',
      } as BulkBooking);

      const result = await bulkBookingService.cancelBulkBooking('bulk-1', 'Test cancellation');

      expect(result.status).toBe('cancelled');
      expect(result.failureReason).toBe('Test cancellation');
    });

    it('should throw error if bulk booking not found', async () => {
      jest.spyOn(AppDataSource.getRepository(BulkBooking), 'findOne').mockResolvedValue(null);

      await expect(bulkBookingService.cancelBulkBooking('non-existent', 'reason')).rejects.toThrow(
        'Bulk booking not found'
      );
    });
  });
});
