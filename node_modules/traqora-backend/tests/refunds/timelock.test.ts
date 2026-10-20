import { RefundService, REFUND_TIER_THRESHOLDS } from '../../src/services/refundService';
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

describe('Time-Locked Refund Safety Mechanism', () => {
  let refundService: RefundService;
  let smallBooking: Booking;
  let largeBooking: Booking;
  let mockFlight: Flight;
  let mockPassenger: Passenger;

  beforeAll(async () => {
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

    // Create small booking (< $100)
    smallBooking = bookingRepo.create({
      flight: mockFlight,
      passenger: mockPassenger,
      status: 'confirmed',
      amountCents: 5000, // $50
      stripePaymentIntentId: 'pi_small_test',
      sorobanBookingId: '1',
    });
    await bookingRepo.save(smallBooking);

    // Create large booking (> $100)
    largeBooking = bookingRepo.create({
      flight: mockFlight,
      passenger: mockPassenger,
      status: 'confirmed',
      amountCents: 50000, // $500
      stripePaymentIntentId: 'pi_large_test',
      sorobanBookingId: '2',
    });
    await bookingRepo.save(largeBooking);
  });

  describe('Refund Tier Thresholds', () => {
    it('should have correct threshold values', () => {
      expect(REFUND_TIER_THRESHOLDS.IMMEDIATE_MAX).toBe(10000); // $100
      expect(REFUND_TIER_THRESHOLDS.DELAYED_HOURS).toBe(48); // 48 hours
    });

    it('should process small refunds immediately', async () => {
      const refund = await refundService.createRefundRequest({
        bookingId: smallBooking.id,
        reason: 'customer_request',
        requestedBy: 'test@example.com',
      });

      expect(refund.isDelayed).toBe(false);
      expect(refund.delayedUntil).toBeNull();
      expect(refund.status).not.toBe('delayed_pending');
    });

    it('should delay large refunds', async () => {
      const refund = await refundService.createRefundRequest({
        bookingId: largeBooking.id,
        reason: 'customer_request',
        requestedBy: 'test@example.com',
      });

      expect(refund.isDelayed).toBe(true);
      expect(refund.delayedUntil).toBeDefined();
      expect(refund.status).toBe('delayed_pending');

      // Check delay is approximately 48 hours
      const delayHours =
        (refund.delayedUntil!.getTime() - new Date().getTime()) / (1000 * 60 * 60);
      expect(delayHours).toBeGreaterThan(47);
      expect(delayHours).toBeLessThan(49);
    });
  });

  describe('requestDelayedRefund', () => {
    it('should create delayed refund with correct metadata', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
        reasonDetails: 'Need to cancel trip',
        requestedBy: 'test@example.com',
      });

      expect(refund.isDelayed).toBe(true);
      expect(refund.status).toBe('delayed_pending');
      expect(refund.delayedUntil).toBeInstanceOf(Date);
      expect(refund.requestedAmountCents).toBe(largeBooking.amountCents);
      expect(refund.requestedBy).toBe('test@example.com');
      expect(refund.reason).toBe('customer_request');
      expect(refund.reasonDetails).toBe('Need to cancel trip');
    });

    it('should not allow duplicate refund requests', async () => {
      await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      await expect(
        refundService.requestDelayedRefund({
          bookingId: largeBooking.id,
          reason: 'customer_request',
        })
      ).rejects.toThrow('Refund request already exists');
    });

    it('should throw error for non-existent booking', async () => {
      await expect(
        refundService.requestDelayedRefund({
          bookingId: 'non-existent-id',
          reason: 'customer_request',
        })
      ).rejects.toThrow('Booking not found');
    });
  });

  describe('cancelDelayedRefund', () => {
    it('should cancel a delayed refund during waiting period', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      const cancelled = await refundService.cancelDelayedRefund(
        refund.id,
        'test@example.com',
        'Changed my mind'
      );

      expect(cancelled.status).toBe('delayed_cancelled');
      expect(cancelled.cancelledBy).toBe('test@example.com');
      expect(cancelled.cancellationReason).toBe('Changed my mind');
      expect(cancelled.cancelledAt).toBeInstanceOf(Date);
    });

    it('should not cancel non-delayed refunds', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: smallBooking.id,
        reason: 'customer_request',
      });

      await expect(
        refundService.cancelDelayedRefund(refund.id, 'test@example.com', 'Cancel')
      ).rejects.toThrow('Only delayed refunds can be cancelled');
    });

    it('should not cancel refund not in delayed_pending status', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      // Cancel it first
      await refundService.cancelDelayedRefund(refund.id, 'test@example.com', 'Cancel');

      // Try to cancel again
      await expect(
        refundService.cancelDelayedRefund(refund.id, 'test@example.com', 'Cancel again')
      ).rejects.toThrow('Refund is not in delayed pending status');
    });

    it('should not cancel refund after delay period expires', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      // Manually set delayedUntil to past
      const refundRepo = AppDataSource.getRepository(Refund);
      refund.delayedUntil = new Date(Date.now() - 1000);
      await refundRepo.save(refund);

      await expect(
        refundService.cancelDelayedRefund(refund.id, 'test@example.com', 'Cancel')
      ).rejects.toThrow('Delay period has expired');
    });
  });

  describe('processDelayedRefund', () => {
    it('should process delayed refund after timelock expires', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      // Manually set delayedUntil to past
      const refundRepo = AppDataSource.getRepository(Refund);
      refund.delayedUntil = new Date(Date.now() - 1000);
      await refundRepo.save(refund);

      const processed = await refundService.processDelayedRefund(refund.id);

      expect(processed.status).not.toBe('delayed_pending');
      expect(['approved', 'processing', 'stripe_refunded', 'onchain_pending']).toContain(
        processed.status
      );
    });

    it('should not process refund before timelock expires', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      await expect(refundService.processDelayedRefund(refund.id)).rejects.toThrow(
        'Delay period has not expired yet'
      );
    });

    it('should not process non-delayed refunds', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: smallBooking.id,
        reason: 'customer_request',
      });

      await expect(refundService.processDelayedRefund(refund.id)).rejects.toThrow(
        'Refund is not a delayed refund'
      );
    });

    it('should re-check eligibility when processing', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      // Change flight departure to past (making refund ineligible)
      const flightRepo = AppDataSource.getRepository(Flight);
      mockFlight.departureTime = new Date(Date.now() - 1000);
      await flightRepo.save(mockFlight);

      // Set delay to expired
      const refundRepo = AppDataSource.getRepository(Refund);
      refund.delayedUntil = new Date(Date.now() - 1000);
      await refundRepo.save(refund);

      const processed = await refundService.processDelayedRefund(refund.id);

      // Should be rejected or require manual review
      expect(['rejected', 'manual_review']).toContain(processed.status);
    });
  });

  describe('emergencyOverrideDelayedRefund', () => {
    it('should override delay and process immediately', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      const overridden = await refundService.emergencyOverrideDelayedRefund(
        refund.id,
        'admin@example.com',
        'Medical emergency - passenger hospitalized'
      );

      expect(overridden.emergencyOverride).toBe(true);
      expect(overridden.emergencyOverrideBy).toBe('admin@example.com');
      expect(overridden.emergencyOverrideReason).toBe(
        'Medical emergency - passenger hospitalized'
      );
      expect(overridden.status).not.toBe('delayed_pending');
    });

    it('should not override non-delayed refunds', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: smallBooking.id,
        reason: 'customer_request',
      });

      await expect(
        refundService.emergencyOverrideDelayedRefund(
          refund.id,
          'admin@example.com',
          'Emergency'
        )
      ).rejects.toThrow('Refund is not a delayed refund');
    });

    it('should not override refund not in delayed_pending status', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      // Cancel it first
      await refundService.cancelDelayedRefund(refund.id, 'test@example.com', 'Cancel');

      await expect(
        refundService.emergencyOverrideDelayedRefund(
          refund.id,
          'admin@example.com',
          'Emergency'
        )
      ).rejects.toThrow('Refund is not in delayed pending status');
    });
  });

  describe('getDelayedRefundsReadyForProcessing', () => {
    it('should return only expired delayed refunds', async () => {
      // Create delayed refund with expired timelock
      const refund1 = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      const refundRepo = AppDataSource.getRepository(Refund);
      refund1.delayedUntil = new Date(Date.now() - 1000);
      await refundRepo.save(refund1);

      // Create another booking for second refund
      const bookingRepo = AppDataSource.getRepository(Booking);
      const largeBooking2 = bookingRepo.create({
        flight: mockFlight,
        passenger: mockPassenger,
        status: 'confirmed',
        amountCents: 60000,
        stripePaymentIntentId: 'pi_large_test2',
        sorobanBookingId: '3',
      });
      await bookingRepo.save(largeBooking2);

      // Create delayed refund with future timelock
      await refundService.requestDelayedRefund({
        bookingId: largeBooking2.id,
        reason: 'customer_request',
      });

      const ready = await refundService.getDelayedRefundsReadyForProcessing();

      expect(ready.length).toBe(1);
      expect(ready[0].id).toBe(refund1.id);
    });

    it('should return empty array when no refunds are ready', async () => {
      await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      const ready = await refundService.getDelayedRefundsReadyForProcessing();

      expect(ready.length).toBe(0);
    });
  });

  describe('getPendingDelayedRefunds', () => {
    it('should return all pending delayed refunds', async () => {
      await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      const pending = await refundService.getPendingDelayedRefunds();

      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe('delayed_pending');
      expect(pending[0].isDelayed).toBe(true);
    });

    it('should not include cancelled delayed refunds', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      await refundService.cancelDelayedRefund(refund.id, 'test@example.com', 'Cancel');

      const pending = await refundService.getPendingDelayedRefunds();

      expect(pending.length).toBe(0);
    });
  });

  describe('Security Rationale', () => {
    it('should prevent immediate large refunds from compromised accounts', async () => {
      // Simulate compromised account attempting large refund
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
        requestedBy: 'attacker@malicious.com',
      });

      // Refund should be delayed, giving time to detect compromise
      expect(refund.isDelayed).toBe(true);
      expect(refund.status).toBe('delayed_pending');

      // Legitimate user can cancel during delay period
      const cancelled = await refundService.cancelDelayedRefund(
        refund.id,
        'test@example.com',
        'I did not request this refund - account may be compromised'
      );

      expect(cancelled.status).toBe('delayed_cancelled');
    });

    it('should allow immediate small refunds for better UX', async () => {
      // Small refunds don't pose significant risk
      const refund = await refundService.requestDelayedRefund({
        bookingId: smallBooking.id,
        reason: 'customer_request',
      });

      expect(refund.isDelayed).toBe(false);
      expect(refund.status).not.toBe('delayed_pending');
    });

    it('should provide emergency override for genuine emergencies', async () => {
      const refund = await refundService.requestDelayedRefund({
        bookingId: largeBooking.id,
        reason: 'customer_request',
      });

      // Admin can override for genuine emergency
      const overridden = await refundService.emergencyOverrideDelayedRefund(
        refund.id,
        'admin@example.com',
        'Verified medical emergency with documentation'
      );

      expect(overridden.emergencyOverride).toBe(true);
      expect(overridden.status).not.toBe('delayed_pending');
    });
  });
});
