import { FareRulesService, FareClass, ChangeFeeQuote, CancellationRefund, FareDifference, UpgradeQuote, NoShowAssessment, RefundEligibility } from '../fareRulesService';
import { Booking } from '../../db/entities/Booking';
import { Flight } from '../../db/entities/Flight';
import { Passenger } from '../../db/entities/Passenger';

function createMockFlight(overrides: Partial<Flight> = {}): Flight {
  const flight = new Flight();
  flight.id = 'flight-1';
  flight.flightNumber = 'DL1234';
  flight.airlineCode = overrides.airlineCode || 'DL';
  flight.fromAirport = 'JFK';
  flight.toAirport = 'LAX';
  flight.departureTime = overrides.departureTime || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  flight.arrivalTime = new Date(flight.departureTime.getTime() + 6 * 60 * 60 * 1000);
  flight.seatsAvailable = 50;
  flight.priceCents = overrides.priceCents || 45000;
  flight.airlineSorobanAddress = 'G...';
  flight.status = 'SCHEDULED';
  flight.dataSource = 'MANUAL';
  flight.syncStatus = 'EXACT_MATCH';
  flight.rawData = overrides.rawData || { fareClass: 'economy' };
  Object.assign(flight, overrides);
  return flight;
}

function createMockBooking(overrides: Partial<Booking> = {}): Booking {
  const booking = new Booking();
  booking.id = 'booking-1';
  booking.idempotencyKey = 'idem-1';
  booking.flight = overrides.flight || createMockFlight();
  booking.passenger = new Passenger();
  booking.passenger.id = 'pass-1';
  booking.passenger.firstName = 'John';
  booking.passenger.lastName = 'Doe';
  booking.passenger.email = 'john@example.com';
  booking.passenger.sorobanAddress = 'G...';
  booking.status = 'confirmed';
  booking.amountCents = booking.flight.priceCents;
  booking.contractSubmitAttempts = 0;
  booking.createdAt = new Date();
  booking.updatedAt = new Date();
  Object.assign(booking, overrides);
  return booking;
}

describe('FareRulesService', () => {
  let service: FareRulesService;

  beforeEach(() => {
    service = new FareRulesService();
  });

  describe('getApplicableFareRules', () => {
    it('should return fare rules for a known airline', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const rules = service.getApplicableFareRules(flight);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0].airline).toBe('DL');
    });

    it('should return fare rules filtered by fare class', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const rules = service.getApplicableFareRules(flight, 'business');
      expect(rules.every(r => r.fareClass === 'business')).toBe(true);
    });

    it('should fall back to DL rules for unknown airlines', () => {
      const flight = createMockFlight({ airlineCode: 'ZZ' });
      const rules = service.getApplicableFareRules(flight);
      expect(rules.length).toBeGreaterThan(0);
    });

    it('should return economy rules for WN (Southwest)', () => {
      const flight = createMockFlight({ airlineCode: 'WN' });
      const rules = service.getApplicableFareRules(flight, 'economy');
      expect(rules.some(r => r.fareBasisCode === 'WGA')).toBe(true);
    });

    it('should return non-changeable rules for NK (Spirit)', () => {
      const flight = createMockFlight({ airlineCode: 'NK' });
      const rules = service.getApplicableFareRules(flight);
      expect(rules[0].changeable).toBe(false);
      expect(rules[0].refundable).toBe(false);
    });
  });

  describe('calculateChangeFee', () => {
    it('should return zero change fee when 60+ days before departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        priceCents: 45000,
      });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const newDate = new Date(flight.departureTime.getTime() + 2 * 24 * 60 * 60 * 1000);
      const quote = service.calculateChangeFee(booking, newDate);
      expect(quote.daysToDeparture).toBeGreaterThanOrEqual(60);
      expect(quote.changeFeeCents).toBe(0);
    });

    it('should apply reduced fee 30-59 days before departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        priceCents: 45000,
      });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const newDate = new Date(flight.departureTime.getTime() + 1 * 24 * 60 * 60 * 1000);
      const quote = service.calculateChangeFee(booking, newDate);
      expect(quote.daysToDeparture).toBeGreaterThanOrEqual(30);
      expect(quote.daysToDeparture).toBeLessThan(60);
      expect(quote.changeFeeCents).toBeGreaterThan(0);
    });

    it('should apply full fee 7-13 days before departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        priceCents: 45000,
      });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const newDate = new Date(flight.departureTime.getTime() + 1 * 24 * 60 * 60 * 1000);
      const quote = service.calculateChangeFee(booking, newDate);
      expect(quote.daysToDeparture).toBeGreaterThanOrEqual(7);
      expect(quote.daysToDeparture).toBeLessThan(14);
      expect(quote.changeFeeCents).toBe(20000);
    });

    it('should give non-changeable result for NK flights', () => {
      const flight = createMockFlight({
        airlineCode: 'NK',
        departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceCents: 25000,
      });
      const booking = createMockBooking({ flight, amountCents: 25000 });
      const newDate = new Date(flight.departureTime.getTime() + 1 * 24 * 60 * 60 * 1000);
      const quote = service.calculateChangeFee(booking, newDate);
      expect(quote.breakdown[0].label).toContain('Non-changeable');
    });

    it('should include fare difference when new date is different', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceCents: 45000,
      });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const farFutureDate = new Date(flight.departureTime.getTime() + 60 * 24 * 60 * 60 * 1000);
      const quote = service.calculateChangeFee(booking, farFutureDate);
      expect(quote.breakdown.length).toBeGreaterThan(0);
      expect(typeof quote.totalDueCents).toBe('number');
    });
  });

  describe('calculateCancellationRefund', () => {
    it('should return full refund for refundable fare within window', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        priceCents: 50000,
      });
      const booking = createMockBooking({
        flight,
        amountCents: 50000,
        status: 'confirmed',
      });
      const refund = service.calculateCancellationRefund(booking);
      expect(refund.eligible).toBe(true);
      expect(refund.netRefundCents).toBeGreaterThan(0);
    });

    it('should return zero refund for non-refundable economy fare', () => {
      const flight = createMockFlight({
        airlineCode: 'NK',
        departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceCents: 25000,
      });
      const booking = createMockBooking({ flight, amountCents: 25000 });
      const refund = service.calculateCancellationRefund(booking);
      expect(refund.eligible).toBe(false);
      expect(refund.netRefundCents).toBe(0);
    });

    it('should apply time-based refund tiers for non-refundable fares', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        priceCents: 60000,
      });
      const booking = createMockBooking({ flight, amountCents: 60000 });
      const refund = service.calculateCancellationRefund(booking);
      expect(refund.refundPercentage).toBe(75);
      expect(refund.netRefundCents).toBe(Math.round(60000 * 0.75));
    });

    it('should return partial refund 14-29 days before departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        priceCents: 60000,
      });
      const booking = createMockBooking({ flight, amountCents: 60000 });
      const refund = service.calculateCancellationRefund(booking);
      expect(refund.refundPercentage).toBe(50);
    });

    it('should return minimal refund 1-2 days before departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        priceCents: 60000,
      });
      const booking = createMockBooking({ flight, amountCents: 60000 });
      const refund = service.calculateCancellationRefund(booking);
      expect(refund.refundPercentage).toBeLessThan(25);
    });
  });

  describe('calculateFareDifference', () => {
    it('should calculate positive fare difference for more expensive flight', () => {
      const flight = createMockFlight({ airlineCode: 'DL', priceCents: 45000 });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const newFlight = createMockFlight({ airlineCode: 'DL', priceCents: 60000 });
      const diff = service.calculateFareDifference(booking, newFlight);
      expect(diff.fareDifferenceCents).toBe(15000);
      expect(diff.totalDueCents).toBeGreaterThanOrEqual(15000);
    });

    it('should calculate negative fare difference for cheaper flight', () => {
      const flight = createMockFlight({ airlineCode: 'DL', priceCents: 60000 });
      const booking = createMockBooking({ flight, amountCents: 60000 });
      const newFlight = createMockFlight({ airlineCode: 'DL', priceCents: 45000 });
      const diff = service.calculateFareDifference(booking, newFlight);
      expect(diff.fareDifferenceCents).toBe(-15000);
    });

    it('should include change fee in total due', () => {
      const flight = createMockFlight({ airlineCode: 'UA', priceCents: 50000 });
      const booking = createMockBooking({ flight, amountCents: 50000 });
      const newFlight = createMockFlight({ airlineCode: 'UA', priceCents: 50000 });
      const diff = service.calculateFareDifference(booking, newFlight);
      expect(diff.changeFeeCents).toBeGreaterThan(0);
    });
  });

  describe('calculateUpgradePrice', () => {
    it('should quote upgrade from economy to business', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        rawData: { fareClass: 'economy' },
      });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const quote = service.calculateUpgradePrice(booking, 'business');
      expect(quote.fromClass).toBe('economy');
      expect(quote.toClass).toBe('business');
      expect(quote.totalDueCents).toBeGreaterThan(0);
    });

    it('should quote upgrade from economy to first', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        rawData: { fareClass: 'economy' },
      });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const quote = service.calculateUpgradePrice(booking, 'first');
      expect(quote.totalDueCents).toBeGreaterThan(quote.upgradeFeeCents);
    });

    it('should return zero for same class upgrade', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        rawData: { fareClass: 'business' },
      });
      const booking = createMockBooking({ flight, amountCents: 100000 });
      const quote = service.calculateUpgradePrice(booking, 'business');
      expect(quote.totalDueCents).toBe(500);
      expect(quote.upgradeFeeCents).toBe(0);
    });

    it('should reject upgrade for unknown target class', () => {
      const flight = createMockFlight({ airlineCode: 'NK', rawData: { fareClass: 'economy' } });
      const booking = createMockBooking({ flight });
      expect(() => service.calculateUpgradePrice(booking, 'business')).toThrow();
    });
  });

  describe('evaluateNoShowPolicy', () => {
    it('should detect no-show for past departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
      });
      const booking = createMockBooking({ flight });
      const assessment = service.evaluateNoShowPolicy(booking);
      expect(assessment.isNoShow).toBe(true);
    });

    it('should not flag no-show for future departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const booking = createMockBooking({ flight });
      const assessment = service.evaluateNoShowPolicy(booking);
      expect(assessment.isNoShow).toBe(false);
      expect(assessment.penaltyCents).toBe(0);
    });

    it('should apply grace period after departure', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() - 10 * 60 * 1000),
      });
      const booking = createMockBooking({ flight });
      const assessment = service.evaluateNoShowPolicy(booking);
      expect(assessment.isNoShow).toBe(true);
      expect(assessment.gracePeriodExpired).toBe(false);
      expect(assessment.penaltyCents).toBe(0);
    });

    it('should apply penalty after grace period expires', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
        priceCents: 50000,
      });
      const booking = createMockBooking({ flight, amountCents: 50000 });
      const assessment = service.evaluateNoShowPolicy(booking);
      expect(assessment.isNoShow).toBe(true);
      expect(assessment.gracePeriodExpired).toBe(true);
      expect(assessment.penaltyCents).toBeGreaterThan(0);
    });

    it('should apply 100% penalty for no-show on non-refundable fare', () => {
      const flight = createMockFlight({
        airlineCode: 'NK',
        departureTime: new Date(Date.now() - 3 * 60 * 60 * 1000),
        priceCents: 25000,
      });
      const booking = createMockBooking({ flight, amountCents: 25000 });
      const assessment = service.evaluateNoShowPolicy(booking);
      expect(assessment.penaltyCents).toBe(25000);
    });
  });

  describe('checkRefundEligibility', () => {
    it('should deem refundable fare as eligible for full refund', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceCents: 100000,
      });
      const booking = createMockBooking({ flight, amountCents: 100000 });
      const eligibility = service.checkRefundEligibility(booking);
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.refundMethod).toBe('full_refund');
    });

    it('should deem non-refundable fare as ineligible', () => {
      const flight = createMockFlight({
        airlineCode: 'NK',
        departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceCents: 25000,
      });
      const booking = createMockBooking({ flight, amountCents: 25000 });
      const eligibility = service.checkRefundEligibility(booking);
      expect(eligibility.eligible).toBe(false);
    });

    it('should offer voucher for non-refundable fare 14+ days before', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        priceCents: 50000,
      });
      const booking = createMockBooking({ flight, amountCents: 50000 });
      const eligibility = service.checkRefundEligibility(booking);
      expect(eligibility.refundMethod).toBe('voucher');
    });

    it('should mark already refunded booking as ineligible', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const booking = createMockBooking({ flight, status: 'refunded' });
      const eligibility = service.checkRefundEligibility(booking);
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.reason).toContain('already been refunded');
    });

    it('should give free cancellation for 60+ days on non-refundable', () => {
      const flight = createMockFlight({
        airlineCode: 'DL',
        departureTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        priceCents: 50000,
      });
      const booking = createMockBooking({ flight, amountCents: 50000 });
      const eligibility = service.checkRefundEligibility(booking);
      expect(eligibility.eligible).toBe(true);
      expect(eligibility.refundMethod).toBe('full_refund');
    });

    it('should return conditions with airline and fare class info', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const booking = createMockBooking({ flight, amountCents: 45000 });
      const eligibility = service.checkRefundEligibility(booking);
      expect(eligibility.conditions.length).toBeGreaterThan(0);
      expect(eligibility.conditions.some(c => c.includes('Airline: DL'))).toBe(true);
      expect(eligibility.conditions.some(c => c.includes('Fare Class'))).toBe(true);
    });
  });
});
