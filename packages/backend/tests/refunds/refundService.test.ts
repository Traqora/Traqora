import { RefundService } from '../../src/services/refundService';
import { AppDataSource } from '../../src/db/dataSource';
import { Booking } from '../../src/db/entities/Booking';
import { Flight } from '../../src/db/entities/Flight';
import { Passenger } from '../../src/db/entities/Passenger';
import { Refund } from '../../src/db/entities/Refund';

// Mock dependencies
jest.mock('../../src/services/stripe', () => ({
  stripe: {
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: 're_mock123',
        status: 'succeeded',
      }),
    },
  },
}));

jest.mock('../../src/services/soroban', () => ({
  buildBatchBookingActionUnsignedXdr: jest.fn().mockResolvedValue({
    xdr: 'mock_xdr_data',
    networkPassphrase: 'Test SDF Network ; September 2015',
  }),
  submitSignedSorobanXdr: jest.fn().mockResolvedValue({
    txHash: '0xmockhash123',
  }),
  getTransactionStatus: jest.fn().mockResolvedValue({
    status: 'success',
    txHash: '0xmockhash123',
  }),
}));

jest.mock('../../src/services/NotificationService', () => ({
  NotificationService: {
    getInstance: jest.fn().mockReturnValue({
      sendEmail: jest.fn().mockResolvedValue(true),
      sendPushNotification: jest.fn().mockResolvedValue(true),
    }),
  },
}));

jest.mock('../../src/services/refundAuditService', () => ({
  RefundAuditService: {
    getInstance: jest.fn().mockReturnValue({
      logAction: jest.fn().mockResolvedValue(undefined),
      getAuditTrail: jest.fn().mockResolvedValue([]),
    }),
  },
}));

describe('RefundService', () => {
  let refundService: RefundService;
  let mockBooking: Booking;
  let mockFlight: Flight;
  let mockPassenger: Passenger;

  beforeAll(async () => {
    // Initialize test database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    refundService = RefundService.getInstance();

    // Create mock data
    const flightRepo = AppDataSource.getRepository(Flight);
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const bookingRepo = AppDataSource.getRepository(Booking);

    // Clean up existing test data
    await AppDataSource.query('DELETE FROM refunds WHERE 1=1');
    await AppDataSource.query('DELETE FROM bookings WHERE 1=1');
    await AppDataSource.query('DELETE FROM flights WHERE 1=1');
    await AppDataSource.query('DELETE FROM passengers WHERE 1=1');

    // Create test flight (7 days in future)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    mockFlight = flightRepo.create({
      flightNumber: 'TEST123',
      fromAirport: 'JFK',
      toAirport: 'LAX',
      departureTime: futureDate,
      priceCents: 50000,
      seatsAvailable: 100,
      airlineSorobanAddress: 'GTEST123',
    });
    await flightRepo.save(mockFlight);

    // Create test passenger
    mockPassenger = passengerRepo.create({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      phone: '+1234567890',
      sorobanAddress: 'GPASSENGER123',
    });
    await passengerRepo.save(mockPassenger);

    // Create test booking
    mockBooking = bookingRepo.create({
      flight: mockFlight,
      passenger: mockPassenger,
      status: 'confirmed',
      amountCents: 50000,
      stripePaymentIntentId: 'pi_test123',
      sorobanBookingId: '1',
    });
    await bookingRepo.save(mockBooking);
  });

  describe('checkEligibility', () => {
    it('should return full refund for bookings 7+ days before departure', async () => {
      const eligibility = await refundService.checkEligibility(mockBooking);

      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.refundPercentage).toBe(100);
      expect(eligibility.requiresManualReview).toBe(false);
      expect(eligibility.processingFeeCents).toBeGreaterThan(0);
    });

    it('should return 80% refund for bookings 3-7 days before departure', async () => {
      // Update flight to 5 days in future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      mockBooking.flight.departureTime = futureDate;

      const eligibility = await refundService.checkEligibility(mockBooking);

      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.refundPercentage).toBe(80);
      expect(eligibility.requiresManualReview).toBe(false);
    });

    it('should return 50% refund for bookings 1-3 days before departure', async () => {
      // Update flight to 2 days in future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      mockBooking.flight.departureTime = futureDate;

      const eligibility = await refundService.checkEligibility(mockBooking);

      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.refundPercentage).toBe(50);
      expect(eligibility.requiresManualReview).toBe(false);
    });

    it('should require manual review for bookings within 24 hours', async () => {
      // Update flight to 12 hours in future
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      mockBooking.flight.departureTime = futureDate;

      const eligibility = await refundService.checkEligibility(mockBooking);

      expect(eligibility.requiresManualReview).toBe(true);
    });

    it('should reject refunds for departed flights', async () => {
      // Update flight to past
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      mockBooking.flight.departureTime = pastDate;

      const eligibility = await refundService.checkEligibility(mockBooking);

      expect(eligibility.isEligible).toBe(false);
      expect(eligibility.requiresManualReview).toBe(true);
    });

    it('should reject refunds for non-confirmed bookings', async () => {
      mockBooking.status = 'awaiting_payment';

      const eligibility = await refundService.checkEligibility(mockBooking);

      expect(eligibility.isEligible).toBe(false);
    });
  });

  describe('createRefundRequest', () => {
    it('should create a refund request and auto-approve if eligible', async () => {
      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
        reasonDetails: 'Change of plans',
        requestedBy: 'test@example.com',
      });

      expect(refund).toBeDefined();
      expect(refund.booking.id).toBe(mockBooking.id);
      expect(refund.reason).toBe('customer_request');
      expect(refund.isEligible).toBe(true);
      // Should be processing or completed after auto-approval
      expect(['approved', 'processing', 'stripe_refunded', 'onchain_pending']).toContain(refund.status);
    });

    it('should create refund with manual review status when required', async () => {
      // Update flight to 12 hours in future
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      mockBooking.flight.departureTime = futureDate;
      await AppDataSource.getRepository(Booking).save(mockBooking);

      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      expect(refund.requiresManualReview).toBe(true);
      expect(refund.status).toBe('manual_review');
    });

    it('should throw error if booking not found', async () => {
      await expect(
        refundService.createRefundRequest({
          bookingId: 'non-existent-id',
          reason: 'customer_request',
        })
      ).rejects.toThrow('Booking not found');
    });

    it('should throw error if refund already exists', async () => {
      await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      await expect(
        refundService.createRefundRequest({
          bookingId: mockBooking.id,
          reason: 'customer_request',
        })
      ).rejects.toThrow('Refund request already exists');
    });
  });

  describe('approveRefund', () => {
    it('should approve refund and calculate final amount', async () => {
      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'flight_cancelled',
      });

      // Get the refund after auto-processing
      const refundRepo = AppDataSource.getRepository(Refund);
      const updatedRefund = await refundRepo.findOne({
        where: { id: refund.id },
        relations: ['booking', 'booking.passenger'],
      });

      expect(updatedRefund).toBeDefined();
      expect(updatedRefund!.approvedAmountCents).toBeGreaterThan(0);
      expect(updatedRefund!.approvedAmountCents).toBeLessThanOrEqual(mockBooking.amountCents);
    });
  });

  describe('processRefund', () => {
    it('should process Stripe refund successfully', async () => {
      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const refundRepo = AppDataSource.getRepository(Refund);
      const processedRefund = await refundRepo.findOne({
        where: { id: refund.id },
      });

      // Should have Stripe refund ID after processing
      expect(processedRefund?.stripeRefundId).toBeDefined();
    });
  });

  describe('manualReview', () => {
    it('should approve refund with custom percentage', async () => {
      // Create refund requiring manual review
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      mockBooking.flight.departureTime = futureDate;
      await AppDataSource.getRepository(Booking).save(mockBooking);

      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const reviewed = await refundService.manualReview(
        refund.id,
        true,
        'admin@example.com',
        'Approved due to special circumstances',
        75
      );

      expect(reviewed.reviewedBy).toBe('admin@example.com');
      expect(reviewed.reviewNotes).toBe('Approved due to special circumstances');
    });

    it('should reject refund with review notes', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      mockBooking.flight.departureTime = futureDate;
      await AppDataSource.getRepository(Booking).save(mockBooking);

      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const reviewed = await refundService.manualReview(
        refund.id,
        false,
        'admin@example.com',
        'Does not meet refund policy criteria'
      );

      expect(reviewed.status).toBe('rejected');
      expect(reviewed.reviewedBy).toBe('admin@example.com');
    });
  });

  describe('getManualReviewQueue', () => {
    it('should return refunds requiring manual review', async () => {
      // Create multiple refunds requiring review
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      mockBooking.flight.departureTime = futureDate;
      await AppDataSource.getRepository(Booking).save(mockBooking);

      await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const queue = await refundService.getManualReviewQueue();

      expect(queue.length).toBeGreaterThan(0);
      expect(queue[0].status).toBe('manual_review');
    });
  });

  describe('getAllRefunds', () => {
    it('should return all refunds with pagination', async () => {
      await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const result = await refundService.getAllRefunds({
        limit: 10,
        offset: 0,
      });

      expect(result.refunds.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should filter refunds by status', async () => {
      await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const result = await refundService.getAllRefunds({
        status: 'approved',
        limit: 10,
        offset: 0,
      });

      // All returned refunds should have the filtered status
      result.refunds.forEach((refund) => {
        expect(['approved', 'processing', 'stripe_refunded', 'onchain_pending']).toContain(refund.status);
      });
    });
  });

  describe('calculateRefundAmount', () => {
    it('should return 100% refund for 72+ hours before departure', () => {
      const result = refundService.calculateRefundAmount(50000, 96);
      expect(result.refundPercentage).toBe(100);
      expect(result.refundAmountCents).toBe(50000);
      expect(result.tier).toBe('full');
    });

    it('should return 50% refund for 24-72 hours before departure', () => {
      const result = refundService.calculateRefundAmount(50000, 48);
      expect(result.refundPercentage).toBe(50);
      expect(result.refundAmountCents).toBe(25000);
      expect(result.tier).toBe('partial');
    });

    it('should return 0% refund for < 24 hours before departure', () => {
      const result = refundService.calculateRefundAmount(50000, 12);
      expect(result.refundPercentage).toBe(0);
      expect(result.refundAmountCents).toBe(0);
      expect(result.tier).toBe('no_refund');
    });

    it('should handle zero amount', () => {
      const result = refundService.calculateRefundAmount(0, 96);
      expect(result.refundPercentage).toBe(100);
      expect(result.refundAmountCents).toBe(0);
      expect(result.tier).toBe('full');
    });
  });

  describe('processAutomatedRefund', () => {
    it('should process automated refund for eligible booking', async () => {
      const result = await refundService.processAutomatedRefund(mockBooking.id);

      expect(result.bookingId).toBe(mockBooking.id);
      expect(result.refundPercentage).toBeGreaterThan(0);
      expect(result.status).toBe('approved');
      expect(['full', 'partial']).toContain(result.tier);
    });

    it('should reject refund for ineligible booking status', async () => {
      mockBooking.status = 'awaiting_payment';
      await AppDataSource.getRepository(Booking).save(mockBooking);

      const result = await refundService.processAutomatedRefund(mockBooking.id);

      expect(result.status).toBe('rejected');
      expect(result.refundPercentage).toBe(0);
    });

    it('should throw error for non-existent booking', async () => {
      await expect(
        refundService.processAutomatedRefund('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Booking not found');
    });
  });

  describe('processBatchRefunds', () => {
    it('should process multiple refunds and return results', async () => {
      const result = await refundService.processBatchRefunds([mockBooking.id]);

      expect(result.processed).toBeGreaterThan(0);
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].status).toBe('approved');
    });

    it('should handle empty booking list', async () => {
      const result = await refundService.processBatchRefunds([]);

      expect(result.processed).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results.length).toBe(0);
    });
  });

  describe('handleDisputeResolution', () => {
    it('should approve refund via dispute resolution', async () => {
      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const resolved = await refundService.handleDisputeResolution(
        refund.id,
        {
          resolution: 'approved',
          resolvedBy: 'admin@test.com',
          notes: 'Approved after dispute review',
          customRefundPercentage: 100,
        }
      );

      expect(resolved.status).toBe('approved');
      expect(resolved.reviewedBy).toBe('admin@test.com');
    });

    it('should reject refund via dispute resolution', async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 12);
      mockBooking.flight.departureTime = futureDate;
      await AppDataSource.getRepository(Booking).save(mockBooking);

      const refund = await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const resolved = await refundService.handleDisputeResolution(
        refund.id,
        {
          resolution: 'rejected',
          resolvedBy: 'admin@test.com',
          notes: 'Rejected after dispute review',
        }
      );

      expect(resolved.status).toBe('rejected');
    });
  });

  describe('getRefundStats', () => {
    it('should return refund statistics', async () => {
      await refundService.createRefundRequest({
        bookingId: mockBooking.id,
        reason: 'customer_request',
      });

      const stats = await refundService.getRefundStats();

      expect(stats.totalRefunds).toBeGreaterThan(0);
      expect(stats.byReason).toBeDefined();
      expect(stats.byStatus).toBeDefined();
      expect(typeof stats.totalAmountCents).toBe('number');
    });
  });

  describe('checkAutomatedEligibility', () => {
    it('should return eligibility for valid booking', async () => {
      const eligibility = await refundService.checkAutomatedEligibility(mockBooking.id);

      expect(eligibility).toBeDefined();
      expect(typeof eligibility.isEligible).toBe('boolean');
      expect(typeof eligibility.refundPercentage).toBe('number');
    });

    it('should throw for non-existent booking', async () => {
      await expect(
        refundService.checkAutomatedEligibility('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow('Booking not found');
    });
  });
});
