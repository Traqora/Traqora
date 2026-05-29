import { BookingService } from '../../src/services/BookingService';
import {
  createMockRepository,
  createMockStripe,
  createMockSorobanClient,
  createMockEmailService,
  createMockRedisClient,
} from '../../../tests/helpers/mocks';
import { BookingBuilder, FlightBuilder, UserBuilder } from '../../../tests/helpers/builders';
import { createBooking, createFlight, createUser } from '../../../tests/helpers/factories';

describe('BookingService', () => {
  let service: BookingService;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let flightRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let stripe: ReturnType<typeof createMockStripe>;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let emailService: ReturnType<typeof createMockEmailService>;
  let redis: ReturnType<typeof createMockRedisClient>;

  beforeEach(() => {
    bookingRepo = createMockRepository();
    flightRepo = createMockRepository();
    userRepo = createMockRepository();
    stripe = createMockStripe();
    soroban = createMockSorobanClient();
    emailService = createMockEmailService();
    redis = createMockRedisClient();

    service = new BookingService(
      bookingRepo as any,
      flightRepo as any,
      userRepo as any,
      stripe as any,
      soroban as any,
      emailService as any,
      redis as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── createBooking ──────────────────────────────────────────────────────────

  describe('createBooking()', () => {
    it('creates a booking and returns it with status pending', async () => {
      const user = new UserBuilder().build();
      const flight = new FlightBuilder().withSeats(50).withPrice(450).build();
      const dto = {
        userId: user.id,
        flightId: flight.id,
        passengerName: 'Ada Lovelace',
        passengerEmail: 'ada@example.com',
        paymentMethod: 'stripe',
        seatNumber: '12B',
      };

      userRepo.findOneBy.mockResolvedValue(user);
      flightRepo.findOneBy.mockResolvedValue(flight);
      bookingRepo.create.mockReturnValue({ ...dto, id: 'b-001', status: 'pending' });
      bookingRepo.save.mockResolvedValue({ ...dto, id: 'b-001', status: 'pending' });

      const result = await service.createBooking(dto);

      expect(bookingRepo.save).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('pending');
      expect(result.userId).toBe(user.id);
    });

    it('throws if the flight does not exist', async () => {
      flightRepo.findOneBy.mockResolvedValue(null);
      userRepo.findOneBy.mockResolvedValue(createUser());

      await expect(
        service.createBooking({ userId: 'u1', flightId: 'unknown', passengerName: 'X', passengerEmail: 'x@e.com' }),
      ).rejects.toThrow(/flight not found/i);
    });

    it('throws if the user does not exist', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.createBooking({ userId: 'ghost', flightId: 'f1', passengerName: 'X', passengerEmail: 'x@e.com' }),
      ).rejects.toThrow(/user not found/i);
    });

    it('throws if no seats are available', async () => {
      const user = new UserBuilder().build();
      const flight = new FlightBuilder().soldOut().build();

      userRepo.findOneBy.mockResolvedValue(user);
      flightRepo.findOneBy.mockResolvedValue(flight);

      await expect(
        service.createBooking({ userId: user.id, flightId: flight.id, passengerName: 'X', passengerEmail: 'x@e.com' }),
      ).rejects.toThrow(/no seats available/i);
    });
  });

  // ── confirmBooking ─────────────────────────────────────────────────────────

  describe('confirmBooking()', () => {
    it('confirms booking after successful Stripe payment', async () => {
      const booking = new BookingBuilder().pending().withStripePayment('pi_test_001').build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_test_001', status: 'succeeded' });
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed' });

      const result = await service.confirmBooking(booking.id);

      expect(result.status).toBe('confirmed');
      expect(emailService.sendBookingConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ id: booking.id }),
      );
    });

    it('throws if payment intent status is not succeeded', async () => {
      const booking = new BookingBuilder().pending().withStripePayment('pi_test_fail').build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_test_fail', status: 'requires_action' });

      await expect(service.confirmBooking(booking.id)).rejects.toThrow(/payment not completed/i);
    });

    it('confirms booking with stellar crypto payment', async () => {
      const booking = new BookingBuilder().pending().withCryptoPayment('STELLAR_HASH_001').build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      soroban.getTransaction.mockResolvedValue({ status: 'SUCCESS' });
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed' });

      const result = await service.confirmBooking(booking.id);

      expect(result.status).toBe('confirmed');
    });

    it('throws if booking is already confirmed', async () => {
      const booking = new BookingBuilder().confirmed().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await expect(service.confirmBooking(booking.id)).rejects.toThrow(/already confirmed/i);
    });
  });

  // ── cancelBooking ──────────────────────────────────────────────────────────

  describe('cancelBooking()', () => {
    it('cancels a confirmed booking', async () => {
      const booking = new BookingBuilder().confirmed().withStripePayment().build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'cancelled' });

      const result = await service.cancelBooking(booking.id, booking.userId);

      expect(result.status).toBe('cancelled');
    });

    it('prevents cancellation by a different user', async () => {
      const booking = new BookingBuilder().confirmed().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await expect(service.cancelBooking(booking.id, 'wrong-user')).rejects.toThrow(/unauthorized/i);
    });

    it('prevents cancellation of an already cancelled booking', async () => {
      const booking = new BookingBuilder().cancelled().build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await expect(service.cancelBooking(booking.id, booking.userId)).rejects.toThrow(/already cancelled/i);
    });
  });

  // ── getBookingById ─────────────────────────────────────────────────────────

  describe('getBookingById()', () => {
    it('returns the booking when found', async () => {
      const booking = createBooking();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      const result = await service.getBookingById(booking.id);
      expect(result).toEqual(booking);
    });

    it('throws NotFoundException when not found', async () => {
      bookingRepo.findOneBy.mockResolvedValue(null);

      await expect(service.getBookingById('no-such-id')).rejects.toThrow(/not found/i);
    });
  });

  // ── getUserBookings ────────────────────────────────────────────────────────

  describe('getUserBookings()', () => {
    it('returns all bookings for a user', async () => {
      const userId = 'user-abc';
      const bookings = [createBooking({ userId }), createBooking({ userId })];
      bookingRepo.find.mockResolvedValue(bookings);

      const result = await service.getUserBookings(userId);

      expect(result).toHaveLength(2);
      expect(bookingRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
    });

    it('returns empty array when user has no bookings', async () => {
      bookingRepo.find.mockResolvedValue([]);
      const result = await service.getUserBookings('no-bookings-user');
      expect(result).toEqual([]);
    });
  });

  // ── caching layer ──────────────────────────────────────────────────────────

  describe('caching', () => {
    it('returns booking from cache when available', async () => {
      const booking = createBooking();
      redis.get.mockResolvedValue(JSON.stringify(booking));

      const result = await service.getBookingById(booking.id);

      expect(result).toEqual(booking);
      expect(bookingRepo.findOneBy).not.toHaveBeenCalled();
    });

    it('stores booking in cache after DB fetch', async () => {
      const booking = createBooking();
      redis.get.mockResolvedValue(null);
      bookingRepo.findOneBy.mockResolvedValue(booking);

      await service.getBookingById(booking.id);

      expect(redis.set).toHaveBeenCalledWith(
        `booking:${booking.id}`,
        JSON.stringify(booking),
        expect.anything(),
      );
    });
  });

  // ── loyalty points ─────────────────────────────────────────────────────────

  describe('loyalty points', () => {
    it('awards loyalty points on booking confirmation', async () => {
      const user = createUser({ loyaltyPoints: 100 });
      const booking = new BookingBuilder().pending().withStripePayment().withAmount(500).build();

      bookingRepo.findOneBy.mockResolvedValue(booking);
      userRepo.findOneBy.mockResolvedValue(user);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: booking.stripePaymentIntentId, status: 'succeeded' });
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed' });

      await service.confirmBooking(booking.id);

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ loyaltyPoints: expect.any(Number) }),
      );
    });
  });
});
