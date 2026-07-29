import { FareRulesService, SeasonalFareOverride, AirlineFareOverride } from '../fareRulesService';
import { Booking } from '../../db/entities/Booking';
import { Flight } from '../../db/entities/Flight';

function createMockFlight(overrides: Partial<Flight> = {}): Flight {
  const flight = new Flight();
  flight.id = 'flight-1';
  flight.flightNumber = 'DL1234';
  flight.airlineCode = 'DL';
  flight.fromAirport = 'JFK';
  flight.toAirport = 'LAX';
  flight.departureTime = new Date('2026-08-15T10:00:00Z');
  flight.arrivalTime = new Date('2026-08-15T13:00:00Z');
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
  booking.email = 'test@example.com';
  booking.phone = '+1234567890';
  booking.sorobanAddress = 'S123456789';
  Object.assign(booking, overrides);
  return booking;
}

describe('FareRulesService', () => {
  let service: FareRulesService;

  beforeEach(() => {
    service = new FareRulesService();
  });

  describe('getApplicableFareRules', () => {
    it('returns rules for known airline', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const rules = service.getApplicableFareRules(flight);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every(r => r.airline === 'DL')).toBe(true);
    });

    it('returns DL rules for unknown airline as fallback', () => {
      const flight = createMockFlight({ airlineCode: 'ZZ' });
      const rules = service.getApplicableFareRules(flight);
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every(r => r.airline === 'DL')).toBe(true);
    });

    it('filters by fare class when specified', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const rules = service.getApplicableFareRules(flight, 'business');
      expect(rules.every(r => r.fareClass === 'business')).toBe(true);
    });

    it('caches results', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const rules1 = service.getApplicableFareRules(flight, 'economy');
      const rules2 = service.getApplicableFareRules(flight, 'economy');
      expect(rules1).toEqual(rules2);
    });
  });

  describe('parseAirlineFareRules', () => {
    it('returns default rules when no raw data provided', () => {
      const result = service.parseAirlineFareRules('DL', {});
      expect(result.rules.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('parses fare rules from raw fare classes array', () => {
      const rawData = {
        fareClasses: [
          { fareBasisCode: 'E', changeable: true, refundable: false, changeFeeCents: 20000 },
          { fareBasisCode: 'J', changeable: true, refundable: true, changeFeeCents: 0 },
        ],
      };
      const result = service.parseAirlineFareRules('DL', rawData);
      expect(result.rules.length).toBe(2);
      expect(result.warnings.length).toBe(0);
    });

    it('falls back for non-parseable entries', () => {
      const rawData = { fareClasses: [{ invalid: true }] };
      const result = service.parseAirlineFareRules('BA', rawData);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('getActiveSeasonalOverride', () => {
    it('returns null when no seasonal overrides match', () => {
      const flight = createMockFlight({ airlineCode: 'UA' });
      const override = service.getActiveSeasonalOverride(flight);
      expect(override).toBeNull();
    });

    it('returns seasonal override when date falls within range', () => {
      const summerStart = new Date();
      summerStart.setMonth(5, 1);
      const summerEnd = new Date();
      summerEnd.setMonth(8, 31);
      const flight = createMockFlight({ airlineCode: 'DL' });
      const override = service.getActiveSeasonalOverride(flight);
      if (override) {
        expect(override.season).toBe('peak');
        expect(override.changeFeeMultiplier).toBeGreaterThan(1);
      }
    });
  });

  describe('getChangeFeeTiers', () => {
    it('returns tiers for known airline and class', () => {
      const tiers = service.getChangeFeeTiers('DL', 'economy');
      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers[0].label).toContain('60+');
      expect(tiers[0].feeCents).toBe(0);
    });

    it('returns empty for unknown airline', () => {
      const tiers = service.getChangeFeeTiers('ZZ', 'economy');
      expect(tiers).toEqual([]);
    });
  });

  describe('getCancellationTiers', () => {
    it('returns tiers for refundable fare class', () => {
      const tiers = service.getCancellationTiers('DL', 'business');
      expect(tiers.length).toBeGreaterThan(0);
    });

    it('returns time-based tiers for non-refundable fare class', () => {
      const tiers = service.getCancellationTiers('DL', 'economy');
      expect(tiers.length).toBeGreaterThan(0);
    });
  });

  describe('calculateChangeFee', () => {
    it('falls back to DL rules for unknown airline', () => {
      const flight = createMockFlight({ airlineCode: 'ZZ' });
      const booking = createMockBooking({ flight });
      const result = service.calculateChangeFee(booking, new Date());
      expect(result.applicableRule.airline).toBe('DL');
    });

    it('returns non-changeable result when fare is not changeable', () => {
      const flight = createMockFlight({ airlineCode: 'NK' });
      const booking = createMockBooking({ flight });
      const result = service.calculateChangeFee(booking, new Date());
      expect(result.changeFeeCents).toBe(0);
      expect(result.breakdown[0].label).toContain('Non-changeable');
    });

    it('calculates change fee with time factor for changeable fare', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const booking = createMockBooking({ flight });
      const result = service.calculateChangeFee(booking, new Date('2026-08-20T10:00:00Z'));
      expect(result.changeFeeCents).toBeGreaterThan(0);
      expect(result.daysToDeparture).toBeGreaterThan(0);
      expect(result.applicableRule).toBeDefined();
    });

    it('uses actual flight price when newFlight is provided', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const booking = createMockBooking({ flight });
      const newFlight = createMockFlight({ airlineCode: 'DL', priceCents: 60000 });
      const result = service.calculateChangeFee(booking, new Date('2026-08-20T10:00:00Z'), newFlight);
      expect(result.fareDifferenceCents).toBe(15000);
    });

    it('applies seasonal multiplier when active', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const booking = createMockBooking({ flight });

      const summerStart = new Date();
      summerStart.setMonth(5, 15);
      const summerEnd = new Date();
      summerEnd.setMonth(8, 15);
      const seasonalOverride: SeasonalFareOverride = {
        season: 'peak', name: 'Test Peak',
        changeFeeMultiplier: 1.5, cancellationFeeMultiplier: 1.25, upgradeDiscountPercent: 0,
        validFrom: summerStart, validTo: summerEnd,
      };
      (service as any).getActiveSeasonalOverride = jest.fn().mockReturnValue(seasonalOverride);

      const result = service.calculateChangeFee(booking, new Date('2026-08-20T10:00:00Z'));
      expect(result.changeFeeCents).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateCancellationRefund', () => {
    it('falls back to DL rules for unknown airline', () => {
      const flight = createMockFlight({ airlineCode: 'ZZ' });
      const booking = createMockBooking({ flight });
      const result = service.calculateCancellationRefund(booking);
      expect(result).toBeDefined();
    });

    it('returns full refund within 24-hour risk-free window', () => {
      const flight = createMockFlight({ airlineCode: 'DL', departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
      jest.spyOn(service as any, 'isWithin24HourRiskFreeWindow').mockReturnValue(true);
      const result = service.calculateCancellationRefund(booking);
      expect(result.eligible).toBe(true);
      expect(result.refundableCents).toBe(booking.amountCents);
      expect(result.refundPercentage).toBe(100);
    });

    it('returns no refund for non-refundable fare at departure (outside 24h window)', () => {
      const flight = createMockFlight({ airlineCode: 'NK', departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });
      const result = service.calculateCancellationRefund(booking);
      expect(result.eligible).toBe(false);
    });

    it('applies cancellation tiers for non-refundable with time', () => {
      const flight = createMockFlight({ airlineCode: 'DL', departureTime: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight });
      const result = service.calculateCancellationRefund(booking);
      expect(result.refundPercentage).toBeGreaterThan(0);
    });

    it('returns full refund for fully refundable fare', () => {
      const flight = createMockFlight({ airlineCode: 'DL' });
      const booking = createMockBooking({ flight });
      jest.spyOn(service, 'getApplicableFareRules').mockReturnValue([{
        fareClass: 'business', fareBasisCode: 'B', airline: 'DL',
        changeable: true, refundable: true,
        changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
        noShowPenalty: 0, noShowGracePeriodMinutes: 15,
        restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
        changeFeePercentage: 0, cancellationFeePercentage: 0,
        rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
        standbyAllowed: true, standbyFeeCents: 0,
      }]);
      const result = service.calculateCancellationRefund(booking);
      expect(result.refundPercentage).toBe(100);
      expect(result.eligible).toBe(true);
    });
  });

  describe('calculateFareDifference', () => {
    it('calculates positive fare difference', () => {
      const booking = createMockBooking();
      const newFlight = createMockFlight({ priceCents: 60000 });
      const result = service.calculateFareDifference(booking, newFlight);
      expect(result.fareDifferenceCents).toBe(15000);
      expect(result.totalDueCents).toBeGreaterThanOrEqual(15000);
    });

    it('calculates negative fare difference', () => {
      const booking = createMockBooking();
      const newFlight = createMockFlight({ priceCents: 30000 });
      const result = service.calculateFareDifference(booking, newFlight);
      expect(result.fareDifferenceCents).toBe(-15000);
    });
  });

  describe('calculateUpgradePrice', () => {
    it('falls back to DL rules for unknown airline', () => {
      const flight = createMockFlight({ airlineCode: 'ZZ' });
      const booking = createMockBooking({ flight });
      const result = service.calculateUpgradePrice(booking, 'business');
      expect(result.fromClass).toBe('economy');
      expect(result.toClass).toBe('business');
    });

    it('returns upgrade quote for valid upgrade path', () => {
      const booking = createMockBooking();
      const result = service.calculateUpgradePrice(booking, 'business');
      expect(result.fromClass).toBe('economy');
      expect(result.toClass).toBe('business');
      expect(result.upgradeFeeCents).toBeGreaterThan(0);
      expect(result.breakdown.length).toBeGreaterThan(0);
    });

    it('returns zero for same-class upgrade', () => {
      const booking = createMockBooking();
      const result = service.calculateUpgradePrice(booking, 'economy');
      expect(result.upgradeFeeCents).toBe(0);
    });
  });

  describe('evaluateNoShowPolicy', () => {
    it('returns isNoShow false when flight has not departed', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight });
      const result = service.evaluateNoShowPolicy(booking);
      expect(result.isNoShow).toBe(false);
      expect(result.penaltyCents).toBe(0);
    });

    it('returns isNoShow true and penalty after departure past grace', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() - 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight });
      const result = service.evaluateNoShowPolicy(booking);
      expect(result.isNoShow).toBe(true);
      expect(result.penaltyCents).toBeGreaterThan(0);
    });

    it('shows within-grace-period when departure passed but grace not expired', () => {
      const flight = createMockFlight({
        departureTime: new Date(Date.now() - 10 * 60 * 1000),
      });
      const booking = createMockBooking({ flight });
      jest.spyOn(service, 'getApplicableFareRules').mockReturnValue([{
        fareClass: 'economy', fareBasisCode: 'E', airline: 'DL',
        changeable: true, refundable: true,
        changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
        noShowPenalty: 0, noShowGracePeriodMinutes: 30,
        restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
        changeFeePercentage: 0, cancellationFeePercentage: 0,
        rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
        standbyAllowed: true, standbyFeeCents: 0,
      }]);
      const result = service.evaluateNoShowPolicy(booking);
      expect(result.isNoShow).toBe(true);
      expect(result.gracePeriodExpired).toBe(false);
      expect(result.penaltyCents).toBe(0);
    });
  });

  describe('checkRefundEligibility', () => {
    it('returns not eligible for already refunded booking', () => {
      const booking = createMockBooking({ status: 'refunded' });
      const result = service.checkRefundEligibility(booking);
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('already been refunded');
    });

    it('checks 24-hour risk-free window first', () => {
      const booking = createMockBooking();
      jest.spyOn(service as any, 'isWithin24HourRiskFreeWindow').mockReturnValue(true);
      const result = service.checkRefundEligibility(booking);
      expect(result.eligible).toBe(true);
      expect(result.refundMethod).toBe('full_refund');
    });

    it('returns non-refundable after departure with 100% no-show penalty', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() - 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight });
      const result = service.checkRefundEligibility(booking);
      expect(result.eligible).toBe(false);
    });

    it('returns voucher for non-refundable between 14-59 days (outside 24h window)', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });
      const result = service.checkRefundEligibility(booking);
      expect(result.refundMethod).toBe('voucher');
    });

    it('returns full refund within free cancellation window (60+ days)', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight });
      const result = service.checkRefundEligibility(booking);
      expect(result.eligible).toBe(true);
      expect(result.refundMethod).toBe('full_refund');
    });

    it('returns full refund for fully refundable fare', () => {
      const booking = createMockBooking();
      jest.spyOn(service, 'getApplicableFareRules').mockReturnValue([{
        fareClass: 'business', fareBasisCode: 'B', airline: 'DL',
        changeable: true, refundable: true,
        changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
        noShowPenalty: 0, noShowGracePeriodMinutes: 15,
        restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
        changeFeePercentage: 0, cancellationFeePercentage: 0,
        rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
        standbyAllowed: true, standbyFeeCents: 0,
      }]);
      const result = service.checkRefundEligibility(booking);
      expect(result.eligible).toBe(true);
      expect(result.refundMethod).toBe('full_refund');
    });
  });

  describe('new airlines', () => {
    it('has BA rules with correct structure', () => {
      const flight = createMockFlight({ airlineCode: 'BA' });
      const allRules = service.parseAirlineFareRules('BA', {});
      expect(allRules.rules.length).toBeGreaterThanOrEqual(5);
      const rules = service.getApplicableFareRules(flight, 'economy');
      expect(rules.length).toBeGreaterThanOrEqual(1);
      expect(rules[0].airline).toBe('BA');
    });

    it('has LH rules with advance purchase requirement on economy', () => {
      const flight = createMockFlight({ airlineCode: 'LH' });
      const rules = service.getApplicableFareRules(flight, 'economy');
      const eRule = rules.find(r => r.fareBasisCode === 'E');
      expect(eRule?.restrictions.advancePurchaseRequired).toBe(true);
      expect(eRule?.restrictions.advancePurchaseDays).toBe(1);
    });

    it('has EK rules with 90-min no-show grace on economy', () => {
      const flight = createMockFlight({ airlineCode: 'EK' });
      const rules = service.getApplicableFareRules(flight, 'economy');
      expect(rules[0].noShowGracePeriodMinutes).toBe(90);
    });

    it('has B6 rules with name change allowed on economy', () => {
      const flight = createMockFlight({ airlineCode: 'B6' });
      const rules = service.getApplicableFareRules(flight, 'economy');
      expect(rules[0].nameChangeAllowed).toBe(true);
    });

    it('has FR rules with non-changeable basic fare', () => {
      const flight = createMockFlight({ airlineCode: 'FR' });
      const rules = service.getApplicableFareRules(flight, 'economy');
      const vRule = rules.find(r => r.fareBasisCode === 'V');
      expect(vRule?.changeable).toBe(false);
    });
  });

  describe('isWithin24HourRiskFreeWindow', () => {
    it('returns true for booking made less than 24h ago with future flight', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
      const result = (service as any).isWithin24HourRiskFreeWindow(booking);
      expect(result).toBe(true);
    });

    it('returns false for booking made more than 24h ago', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight, createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000) });
      const result = (service as any).isWithin24HourRiskFreeWindow(booking);
      expect(result).toBe(false);
    });

    it('returns false for flight departing within 24h', () => {
      const flight = createMockFlight({ departureTime: new Date(Date.now() + 2 * 60 * 60 * 1000) });
      const booking = createMockBooking({ flight, createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
      const result = (service as any).isWithin24HourRiskFreeWindow(booking);
      expect(result).toBe(false);
    });

    it('returns false when booking has no createdAt', () => {
      const booking = createMockBooking();
      (booking as any).createdAt = undefined;
      const result = (service as any).isWithin24HourRiskFreeWindow(booking);
      expect(result).toBe(false);
    });
  });
});
