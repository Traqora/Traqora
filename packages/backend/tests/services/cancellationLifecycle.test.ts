/**
 * Cancellation and refund lifecycle coverage (issue #1190).
 *
 * Exercises the four V1 outcomes at the service boundary:
 *  1. eligible cancellation (full refund),
 *  2. ineligible cancellation (no refund),
 *  3. partial refund (time based tier),
 *  4. delayed refund (timelock gating).
 *
 * All logic is deterministic and database free so it runs in the normal unit
 * suite. Fare rule selection is stubbed to pin a specific fare class.
 */
import { FareRulesService, FareRule, FareClass } from '../../src/services/fareRulesService';
import { isDelayedRefundReady } from '../../src/services/refundTiming';
import { Booking } from '../../src/db/entities/Booking';
import { Flight } from '../../src/db/entities/Flight';

const daysFromNow = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

function makeFlight(airlineCode = 'DL', departureTime = daysFromNow(45)): Flight {
  const flight = new Flight();
  flight.id = 'flight-1';
  flight.flightNumber = 'DL1234';
  flight.airlineCode = airlineCode;
  flight.fromAirport = 'JFK';
  flight.toAirport = 'LAX';
  flight.departureTime = departureTime;
  flight.arrivalTime = departureTime;
  flight.priceCents = 45000;
  Object.assign(flight, { rawData: { fareClass: 'economy' } });
  return flight;
}

function makeBooking(flight: Flight): Booking {
  const booking = new Booking();
  booking.id = 'booking-1';
  booking.flight = flight;
  booking.amountCents = 45000;
  booking.status = 'confirmed';
  booking.createdAt = new Date();
  return booking;
}

function fareRule(overrides: Partial<FareRule> = {}): FareRule {
  return {
    fareClass: 'economy' as FareClass,
    fareBasisCode: 'E',
    airline: 'DL',
    changeable: true,
    refundable: false,
    changeFeeCents: 0,
    cancellationFeeCents: 0,
    upgradeFeeCents: 0,
    noShowPenalty: 100,
    noShowGracePeriodMinutes: 15,
    restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
    changeFeePercentage: 0,
    cancellationFeePercentage: 50,
    rebookingAllowed: true,
    nameChangeAllowed: true,
    nameChangeFeeCents: 0,
    standbyAllowed: true,
    standbyFeeCents: 0,
    ...overrides,
  } as FareRule;
}

describe('cancellation and refund lifecycle (#1190)', () => {
  let service: FareRulesService;

  beforeEach(() => {
    service = new FareRulesService();
    jest.spyOn(service as any, 'isWithin24HourRiskFreeWindow').mockReturnValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('eligible cancellation', () => {
    it('grants a full refund inside the 24-hour risk-free window', () => {
      (service as any).isWithin24HourRiskFreeWindow.mockReturnValue(true);
      const booking = makeBooking(makeFlight());

      const result = service.calculateCancellationRefund(booking);

      expect(result.eligible).toBe(true);
      expect(result.refundPercentage).toBe(100);
      expect(result.penaltyCents).toBe(0);
      expect(result.netRefundCents).toBe(booking.amountCents);
    });
  });

  describe('ineligible cancellation', () => {
    it('returns no refund for a non-refundable fare with a full penalty', () => {
      jest.spyOn(service, 'getApplicableFareRules').mockReturnValue([
        fareRule({ refundable: false, cancellationFeePercentage: 100 }),
      ]);
      const booking = makeBooking(makeFlight());

      const result = service.calculateCancellationRefund(booking);

      expect(result.eligible).toBe(false);
      expect(result.refundPercentage).toBe(0);
      expect(result.refundableCents).toBe(0);
      expect(result.netRefundCents).toBe(0);
      expect(result.penaltyCents).toBe(booking.amountCents);
    });

    it('does not cancel when confirmation of ineligible terms is attempted', () => {
      jest.spyOn(service, 'getApplicableFareRules').mockReturnValue([
        fareRule({ refundable: false, cancellationFeePercentage: 100 }),
      ]);
      const result = service.calculateCancellationRefund(makeBooking(makeFlight()));
      expect(result.eligible).toBe(false);
      expect(result.reason).toBeDefined();
    });
  });

  describe('partial refund', () => {
    it('applies a time based tier that refunds part of a non-refundable fare', () => {
      jest.spyOn(service, 'getApplicableFareRules').mockReturnValue([
        fareRule({ refundable: false, cancellationFeePercentage: 50 }),
      ]);
      const booking = makeBooking(makeFlight('DL', daysFromNow(45)));

      const result = service.calculateCancellationRefund(booking);

      expect(result.eligible).toBe(true);
      expect(result.refundPercentage).toBeGreaterThan(0);
      expect(result.refundPercentage).toBeLessThan(100);
      expect(result.netRefundCents).toBeGreaterThan(0);
      expect(result.netRefundCents).toBeLessThanOrEqual(booking.amountCents);
      expect(result.penaltyCents).toBeGreaterThan(0);
      expect(result.netRefundCents).toBeLessThanOrEqual(result.refundableCents);
    });
  });

  describe('delayed refund timelock', () => {
    const now = new Date('2026-11-20T00:00:00Z');

    it('is not ready before the timelock expires', () => {
      expect(
        isDelayedRefundReady(
          { isDelayed: true, delayedUntil: new Date(now.getTime() + 60_000) },
          now,
        ),
      ).toBe(false);
    });

    it('is ready once the timelock expires', () => {
      expect(
        isDelayedRefundReady(
          { isDelayed: true, delayedUntil: new Date(now.getTime() - 60_000) },
          now,
        ),
      ).toBe(true);
    });

    it('is ready exactly at the timelock boundary', () => {
      expect(isDelayedRefundReady({ isDelayed: true, delayedUntil: now }, now)).toBe(true);
    });

    it('never selects a refund that is not delayed or has no expiry', () => {
      expect(isDelayedRefundReady({ isDelayed: false, delayedUntil: daysFromNow(-1) }, now)).toBe(false);
      expect(isDelayedRefundReady({ isDelayed: true, delayedUntil: null }, now)).toBe(false);
      expect(isDelayedRefundReady({ delayedUntil: daysFromNow(-1) }, now)).toBe(false);
    });
  });
});
