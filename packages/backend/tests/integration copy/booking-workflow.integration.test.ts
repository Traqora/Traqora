/**
 * Booking Workflow Integration Tests
 * Tests the full HTTP request/response cycle for booking endpoints,
 * using a real Express app with mocked external services (Stripe, Stellar).
 */

import request from 'supertest';
import { createApp } from '../../src/app';
import { createMockStripe, createMockSorobanClient, createMockRepository, createMockRedisClient } from '../helpers/mocks';
import { BookingBuilder, FlightBuilder, UserBuilder } from '../helpers/builders';
import { createBooking, createFlight, createUser } from '../helpers/factories';

describe('Booking Workflow Integration', () => {
  let app: Express.Application;
  let bookingRepo: ReturnType<typeof createMockRepository>;
  let flightRepo: ReturnType<typeof createMockRepository>;
  let userRepo: ReturnType<typeof createMockRepository>;
  let stripe: ReturnType<typeof createMockStripe>;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let redis: ReturnType<typeof createMockRedisClient>;
  let authToken: string;
  let testUser: any;

  beforeEach(() => {
    bookingRepo = createMockRepository();
    flightRepo = createMockRepository();
    userRepo = createMockRepository();
    stripe = createMockStripe();
    soroban = createMockSorobanClient();
    redis = createMockRedisClient();

    app = createApp({ bookingRepo, flightRepo, userRepo, stripe, soroban, redis } as any);

    testUser = new UserBuilder().withEmail('tester@traqora.com').build();
    authToken = `Bearer mock.jwt.for.${testUser.id}`;
    userRepo.findOneBy.mockResolvedValue(testUser);
  });

  afterEach(() => jest.clearAllMocks());

  // ── POST /bookings ─────────────────────────────────────────────────────────

  describe('POST /api/bookings', () => {
    it('creates a booking and returns 201 with pending status', async () => {
      const flight = new FlightBuilder().withSeats(50).withPrice(450).build();
      const created = new BookingBuilder().pending().forUser(testUser.id).forFlight(flight.id).build();

      flightRepo.findOneBy.mockResolvedValue(flight);
      bookingRepo.create.mockReturnValue(created);
      bookingRepo.save.mockResolvedValue(created);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', authToken)
        .send({
          flightId: flight.id,
          passengerName: 'Ada Lovelace',
          passengerEmail: 'ada@traqora.com',
          paymentMethod: 'stripe',
          seatNumber: '12A',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.userId).toBe(testUser.id);
    });

    it('returns 404 when flight does not exist', async () => {
      flightRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', authToken)
        .send({ flightId: 'ghost-flight', passengerName: 'X', passengerEmail: 'x@e.com' });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/not found/i);
    });

    it('returns 422 when flight has no available seats', async () => {
      const flight = new FlightBuilder().soldOut().build();
      flightRepo.findOneBy.mockResolvedValue(flight);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', authToken)
        .send({ flightId: flight.id, passengerName: 'X', passengerEmail: 'x@e.com' });

      expect(res.status).toBe(422);
    });

    it('returns 401 when no auth token is provided', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({ flightId: 'f-001', passengerName: 'X', passengerEmail: 'x@e.com' });

      expect(res.status).toBe(401);
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', authToken)
        .send({}); // missing all required fields

      expect(res.status).toBe(400);
    });
  });

  // ── GET /bookings/:id ──────────────────────────────────────────────────────

  describe('GET /api/bookings/:id', () => {
    it('returns 200 with booking data for the owner', async () => {
      const booking = new BookingBuilder().confirmed().forUser(testUser.id).build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      const res = await request(app)
        .get(`/api/bookings/${booking.id}`)
        .set('Authorization', authToken);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(booking.id);
    });

    it('returns 403 when accessing another user's booking', async () => {
      const otherUserBooking = new BookingBuilder().confirmed().forUser('other-user-id').build();
      bookingRepo.findOneBy.mockResolvedValue(otherUserBooking);

      const res = await request(app)
        .get(`/api/bookings/${otherUserBooking.id}`)
        .set('Authorization', authToken);

      expect(res.status).toBe(403);
    });

    it('returns 404 for a non-existent booking', async () => {
      bookingRepo.findOneBy.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/bookings/no-such-id')
        .set('Authorization', authToken);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /bookings/:id/confirm ─────────────────────────────────────────────

  describe('POST /api/bookings/:id/confirm', () => {
    it('confirms booking after Stripe payment succeeds', async () => {
      const booking = new BookingBuilder().pending().forUser(testUser.id).withStripePayment('pi_success').build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_success', status: 'succeeded' });
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed' });

      const res = await request(app)
        .post(`/api/bookings/${booking.id}/confirm`)
        .set('Authorization', authToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('confirmed');
    });

    it('returns 402 when Stripe payment is not yet completed', async () => {
      const booking = new BookingBuilder().pending().forUser(testUser.id).withStripePayment('pi_pending').build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: 'pi_pending', status: 'requires_action' });

      const res = await request(app)
        .post(`/api/bookings/${booking.id}/confirm`)
        .set('Authorization', authToken);

      expect(res.status).toBe(402);
    });
  });

  // ── DELETE /bookings/:id ───────────────────────────────────────────────────

  describe('DELETE /api/bookings/:id', () => {
    it('cancels a confirmed booking and returns 200', async () => {
      const booking = new BookingBuilder().confirmed().forUser(testUser.id).build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'cancelled' });

      const res = await request(app)
        .delete(`/api/bookings/${booking.id}`)
        .set('Authorization', authToken);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });

    it('returns 403 when trying to cancel another user's booking', async () => {
      const booking = new BookingBuilder().confirmed().forUser('not-me').build();
      bookingRepo.findOneBy.mockResolvedValue(booking);

      const res = await request(app)
        .delete(`/api/bookings/${booking.id}`)
        .set('Authorization', authToken);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /bookings (user list) ──────────────────────────────────────────────

  describe('GET /api/bookings', () => {
    it('returns all bookings for the authenticated user', async () => {
      const bookings = [
        new BookingBuilder().confirmed().forUser(testUser.id).build(),
        new BookingBuilder().pending().forUser(testUser.id).build(),
      ];
      bookingRepo.find.mockResolvedValue(bookings);

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', authToken);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });

    it('returns empty array when user has no bookings', async () => {
      bookingRepo.find.mockResolvedValue([]);

      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', authToken);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ── Stripe webhook ─────────────────────────────────────────────────────────

  describe('POST /api/webhooks/stripe', () => {
    it('processes payment_intent.succeeded and auto-confirms booking', async () => {
      const booking = new BookingBuilder().pending().withStripePayment('pi_wh_test').build();
      bookingRepo.findOneBy.mockResolvedValue(booking);
      bookingRepo.save.mockResolvedValue({ ...booking, status: 'confirmed' });

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_wh_test', status: 'succeeded', metadata: { bookingId: booking.id } } },
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'valid_sig')
        .send(Buffer.from('{}'));

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);
    });

    it('returns 400 on invalid Stripe signature', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const res = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'bad_sig')
        .send(Buffer.from('bad_payload'));

      expect(res.status).toBe(400);
    });
  });
});
