/**
 * Booking cancel policy engine (#785) — regression tests.
 *
 * Covers
 * ------
 *   resolveCancelPolicyDecision (pure policy):
 *     - every cancellable state maps to action "refund"
 *     - "refunded" is an idempotent no-op (already_refund_cancelled)
 *     - "failed" and "refund_rejected" are rejected with a stable reason + 409
 *
 *   BookingOrchestrationService.processCancellation (state machine):
 *     - happy path: cancellable booking → saved as "refunded", policy attached
 *     - failure mode: cancelling a "failed" booking is refused and mutates nothing
 *     - idempotency: re-POST of an already-cancelled booking does not re-save
 *     - fare-rule failure mode: non-refundable fare → success:false, no save
 *     - unknown booking → BadRequestError
 */

import {
  BookingOrchestrationService,
  resolveCancelPolicyDecision,
  CANCEL_REJECTION_REASONS,
  CancelPolicyDecision,
} from '../bookingOrchestrationService';
import { Booking } from '../../db/entities/Booking';
import { Flight } from '../../db/entities/Flight';
import { BadRequestError, ConflictError } from '../../utils/errors';

const mockFindOne = jest.fn();
const mockSave = jest.fn();

jest.mock('../../db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn().mockReturnValue({
      findOne: (...args: unknown[]) => mockFindOne(...args),
      save: (...args: unknown[]) => mockSave(...args),
      create: jest.fn(),
      find: jest.fn(),
      increment: jest.fn(),
    }),
  },
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

function createMockFlight(overrides: Partial<Flight> = {}): Flight {
  const flight = new Flight();
  flight.id = 'flight-1';
  flight.flightNumber = 'DL1234';
  flight.airlineCode = 'DL';
  flight.fromAirport = 'JFK';
  flight.toAirport = 'LAX';
  flight.departureTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  flight.arrivalTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000);
  flight.priceCents = 45000;
  flight.seatsAvailable = 50;
  flight.airlineSorobanAddress = 'S123456789';
  flight.status = 'SCHEDULED';
  flight.dataSource = 'MANUAL';
  flight.syncStatus = 'EXACT_MATCH';
  flight.syncAttempts = 0;
  flight.rawData = { fareClass: 'economy' };
  Object.assign(flight, overrides);
  return flight;
}

function createMockBooking(overrides: Partial<Booking> = {}): Booking {
  const booking = new Booking();
  booking.id = 'booking-1';
  booking.flight = createMockFlight();
  booking.amountCents = 45000;
  booking.status = 'confirmed';
  booking.createdAt = new Date();
  Object.assign(booking, overrides);
  return booking;
}

describe('resolveCancelPolicyDecision (#785 contract)', () => {
  it('maps every cancellable state to action "refund"', () => {
    const cancellable = [
      'created',
      'awaiting_payment',
      'payment_processing',
      'paid',
      'onchain_pending',
      'onchain_submitted',
      'confirmed',
    ] as const;

    for (const status of cancellable) {
      const decision = resolveCancelPolicyDecision(status);
      expect(decision.action).toBe('refund');
      expect(decision.httpStatus).toBe(200);
    }
  });

  it('treats an already-refunded booking as an idempotent no-op, not an error', () => {
    const decision = resolveCancelPolicyDecision('refunded');
    expect(decision.action).toBe('already_refund_cancelled');
    expect(decision.reason).toBe(CANCEL_REJECTION_REASONS.ALREADY_CANCELLED);
    expect(decision.httpStatus).toBe(200);
  });

  it('rejects cancelling a failed booking with a stable reason and 409', () => {
    const decision = resolveCancelPolicyDecision('failed');
    expect(decision.action).toBe('reject');
    expect(decision.reason).toBe(CANCEL_REJECTION_REASONS.BOOKING_FAILED);
    expect(decision.httpStatus).toBe(409);
  });

  it('rejects re-cancelling a refund-rejected booking with a stable reason and 409', () => {
    const decision = resolveCancelPolicyDecision('refund_rejected');
    expect(decision.action).toBe('reject');
    expect(decision.reason).toBe(CANCEL_REJECTION_REASONS.REFUND_REJECTED);
    expect(decision.httpStatus).toBe(409);
  });
});

describe('BookingOrchestrationService.processCancellation (#785)', () => {
  let service: BookingOrchestrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BookingOrchestrationService();
    mockSave.mockImplementation(async (booking: Booking) => booking);
  });

  it('cancels a cancellable booking: saves "refunded" and attaches the policy', async () => {
    const booking = createMockBooking({ status: 'confirmed' });
    mockFindOne.mockResolvedValue(booking);

    const result = await service.processCancellation('booking-1');

    expect(result.success).toBe(true);
    expect(result.refund.eligible).toBe(true);
    expect(result.policy?.action).toBe('refund');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave.mock.calls[0][0].status).toBe('refunded');
  });

  it('FAILURE MODE: refuses to cancel a failed booking and mutates nothing', async () => {
    const booking = createMockBooking({ status: 'failed' });
    mockFindOne.mockResolvedValue(booking);

    await expect(service.processCancellation('booking-1')).rejects.toThrow(ConflictError);
    await expect(service.processCancellation('booking-1')).rejects.toThrow(
      new RegExp(CANCEL_REJECTION_REASONS.BOOKING_FAILED),
    );

    // The booking must not have been flipped to "refunded".
    expect(mockSave).not.toHaveBeenCalled();
    expect(booking.status).toBe('failed');
  });

  it('is idempotent: re-cancelling a refunded booking succeeds without saving', async () => {
    const booking = createMockBooking({ status: 'refunded' });
    mockFindOne.mockResolvedValue(booking);

    const result = await service.processCancellation('booking-1');

    expect(result.success).toBe(true);
    expect(result.policy?.action).toBe('already_refund_cancelled');
    expect(result.message).toMatch(/already been cancelled/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('FAILURE MODE: non-refundable fare returns success:false without saving', async () => {
    // Spirit (NK) economy is non-refundable with a 100% cancellation fee;
    // booking older than the 24h risk-free window.
    const booking = createMockBooking({
      status: 'paid',
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      flight: createMockFlight({ airlineCode: 'NK' }),
    });
    mockFindOne.mockResolvedValue(booking);

    const result = await service.processCancellation('booking-1');

    expect(result.success).toBe(false);
    expect(result.refund.eligible).toBe(false);
    expect(result.refund.netRefundCents).toBe(0);
    expect(result.policy?.action).toBe('refund');
    expect(mockSave).not.toHaveBeenCalled();
    expect(booking.status).toBe('paid');
  });

  it('returns BadRequestError for an unknown booking', async () => {
    mockFindOne.mockResolvedValue(null);

    await expect(service.processCancellation('missing')).rejects.toThrow(BadRequestError);
    expect(mockSave).not.toHaveBeenCalled();
  });
});
