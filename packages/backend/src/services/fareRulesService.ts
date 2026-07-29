import { Booking } from '../db/entities/Booking';
import { Flight } from '../db/entities/Flight';
import { BadRequestError } from '../utils/errors';

export type FareClass = 'economy' | 'premium_economy' | 'business' | 'first';
export type FareBasisCode = string;
export type AirlineCode = string;

export interface FareRestrictions {
  advancePurchaseRequired: boolean;
  advancePurchaseDays?: number;
  minStay?: string;
  maxStay?: string;
  minStayDays?: number;
  maxStayDays?: number;
  blackoutDates?: string[];
  flightApplication?: string;
  nonRefundableIndicator?: boolean;
}

export interface FareRule {
  fareClass: FareClass;
  fareBasisCode: FareBasisCode;
  airline: AirlineCode;
  changeable: boolean;
  refundable: boolean;
  changeFeeCents: number;
  cancellationFeeCents: number;
  upgradeFeeCents: number;
  noShowPenalty: number;
  noShowGracePeriodMinutes: number;
  restrictions: FareRestrictions;
  changeFeePercentage: number;
  cancellationFeePercentage: number;
  rebookingAllowed: boolean;
  nameChangeAllowed: boolean;
  nameChangeFeeCents: number;
  standbyAllowed: boolean;
  standbyFeeCents: number;
}

export interface ChangeFeeQuote {
  changeFeeCents: number;
  fareDifferenceCents: number;
  totalDueCents: number;
  currency: string;
  breakdown: { label: string; amount: number; explanation: string }[];
  daysToDeparture: number;
  applicableRule: FareRule;
}

export interface CancellationRefund {
  refundableCents: number;
  penaltyCents: number;
  netRefundCents: number;
  currency: string;
  breakdown: { label: string; amount: number }[];
  refundPercentage: number;
  daysToDeparture: number;
  eligible: boolean;
  reason?: string;
}

export interface FareDifference {
  fareDifferenceCents: number;
  newFlightPriceCents: number;
  originalPriceCents: number;
  changeFeeCents: number;
  totalDueCents: number;
  currency: string;
  breakdown: { label: string; amount: number }[];
}

export interface UpgradeQuote {
  upgradeFeeCents: number;
  fareDifferenceCents: number;
  totalDueCents: number;
  currency: string;
  fromClass: FareClass;
  toClass: FareClass;
  breakdown: { label: string; amount: number }[];
}

export interface NoShowAssessment {
  isNoShow: boolean;
  penaltyCents: number;
  gracePeriodExpired: boolean;
  graceEndTime: Date;
  breakdown: { label: string; amount: number }[];
}

export interface RefundEligibility {
  eligible: boolean;
  refundableCents: number;
  nonRefundableCents: number;
  refundMethod: 'full_refund' | 'partial_refund' | 'voucher' | 'non_refundable';
  reason: string;
  conditions: string[];
}

const FARE_RULES_CACHE: Map<string, FareRule[]> = new Map();

const DEFAULT_FARE_RULES: Record<string, FareRule[]> = {
  DL: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'DL',
      changeable: true, refundable: false,
      changeFeeCents: 20000, cancellationFeeCents: 0, upgradeFeeCents: 15000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 60,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 7500,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ER', airline: 'DL',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 10000,
      noShowPenalty: 0, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 5000,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'premium_economy', fareBasisCode: 'PE', airline: 'DL',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 5000, upgradeFeeCents: 25000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 45,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 25,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'B', airline: 'DL',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 15,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'first', fareBasisCode: 'F', airline: 'DL',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  AA: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'AA',
      changeable: true, refundable: false,
      changeFeeCents: 20000, cancellationFeeCents: 0, upgradeFeeCents: 15000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 60,
      restrictions: { advancePurchaseRequired: true, advancePurchaseDays: 1, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 7500,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ER', airline: 'AA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 10000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 7500,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'B', airline: 'AA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 15,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'first', fareBasisCode: 'F', airline: 'AA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  UA: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'UA',
      changeable: true, refundable: false,
      changeFeeCents: 20000, cancellationFeeCents: 5000, upgradeFeeCents: 15000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 60,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 50,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 7500,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ER', airline: 'UA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 10000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 5000,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'B', airline: 'UA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 15,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'first', fareBasisCode: 'F', airline: 'UA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  WN: [
    {
      fareClass: 'economy', fareBasisCode: 'WGA', airline: 'WN',
      changeable: true, refundable: false,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 100, noShowGracePeriodMinutes: 10,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'BS', airline: 'WN',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 10,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  NK: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'NK',
      changeable: false, refundable: false,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 100, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 0, nonRefundableIndicator: true },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: false, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: false, standbyFeeCents: 0,
    },
  ],
};

export class FareRulesService {
  getApplicableFareRules(flight: Flight, fareClass?: FareClass): FareRule[] {
    const airlineCode = flight.airlineCode || 'UNKNOWN';
    const rules = DEFAULT_FARE_RULES[airlineCode] || DEFAULT_FARE_RULES['DL'];
    const cachedKey = `${airlineCode}_${fareClass || 'all'}`;
    const cached = FARE_RULES_CACHE.get(cachedKey);
    if (cached) return cached;

    let applicable = rules;
    if (fareClass) {
      applicable = rules.filter(r => r.fareClass === fareClass);
    }

    const mappedFareBasis = this.mapFareClassToBasisCode(fareClass || 'economy', airlineCode);
    if (mappedFareBasis) {
      const basisMatch = rules.filter(r => r.fareBasisCode === mappedFareBasis);
      if (basisMatch.length > 0) {
        applicable = basisMatch;
      }
    }

    FARE_RULES_CACHE.set(cachedKey, applicable);
    return applicable;
  }

  private mapFareClassToBasisCode(fareClass: FareClass, airlineCode: AirlineCode): string | null {
    const basisMap: Record<string, Record<string, string>> = {
      DL: { economy: 'E', premium_economy: 'PE', business: 'B', first: 'F' },
      AA: { economy: 'E', premium_economy: 'PE', business: 'B', first: 'F' },
      UA: { economy: 'E', premium_economy: 'PE', business: 'B', first: 'F' },
      WN: { economy: 'WGA', business: 'BS' },
      NK: { economy: 'E' },
    };
    return basisMap[airlineCode]?.[fareClass] || null;
  }

  calculateChangeFee(booking: Booking, newFlightDate: Date): ChangeFeeQuote {
    const flight = booking.flight;
    const rules = this.getApplicableFareRules(flight);
    if (rules.length === 0) {
      throw new BadRequestError('No fare rules found for this booking');
    }

    const fareRule = rules[0];
    const now = new Date();
    const departureTime = flight.departureTime;
    const daysToDeparture = Math.max(0, Math.ceil((departureTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const breakdown: { label: string; amount: number; explanation: string }[] = [];

    let changeFee = fareRule.changeFeeCents;

    if (!fareRule.changeable) {
      return {
        changeFeeCents: 0,
        fareDifferenceCents: 0,
        totalDueCents: 0,
        currency: 'USD',
        breakdown: [{ label: 'Non-changeable fare', amount: 0, explanation: 'This fare class does not allow changes' }],
        daysToDeparture,
        applicableRule: fareRule,
      };
    }

    if (fareRule.changeFeePercentage > 0) {
      changeFee = Math.round(booking.amountCents * (fareRule.changeFeePercentage / 100));
    }

    const feeFactor = this.getTimeBasedFeeFactor(daysToDeparture);
    const adjustedFee = Math.round(changeFee * feeFactor);

    if (daysToDeparture >= 60) {
      breakdown.push({ label: 'Change fee (60+ days before departure)', amount: 0, explanation: 'Changes are free when made 60+ days before departure' });
    } else {
      breakdown.push({
        label: `Time-based change fee (${daysToDeparture} days before departure)`,
        amount: adjustedFee,
        explanation: `Base fee $${(fareRule.changeFeeCents / 100).toFixed(2)} adjusted by ${(feeFactor * 100).toFixed(0)}% time factor`,
      });
    }

    const fareDifferenceCents = this.calculateFareDifferenceFromDate(booking, newFlightDate);

    if (fareDifferenceCents > 0) {
      breakdown.push({
        label: 'Fare difference (higher fare)',
        amount: fareDifferenceCents,
        explanation: 'The new flight is more expensive than the original',
      });
    } else if (fareDifferenceCents < 0) {
      breakdown.push({
        label: 'Fare difference credit (lower fare)',
        amount: fareDifferenceCents,
        explanation: 'The new flight is cheaper. Credit applied',
      });
    }

    const totalDue = Math.max(0, adjustedFee + fareDifferenceCents);

    return {
      changeFeeCents: adjustedFee,
      fareDifferenceCents,
      totalDueCents: totalDue,
      currency: 'USD',
      breakdown,
      daysToDeparture,
      applicableRule: fareRule,
    };
  }

  private getTimeBasedFeeFactor(daysToDeparture: number): number {
    if (daysToDeparture >= 60) return 0;
    if (daysToDeparture >= 30) return 0.5;
    if (daysToDeparture >= 14) return 0.75;
    if (daysToDeparture >= 7) return 1.0;
    if (daysToDeparture >= 3) return 1.25;
    if (daysToDeparture >= 1) return 1.5;
    return 2.0;
  }

  private calculateFareDifferenceFromDate(booking: Booking, newFlightDate: Date): number {
    const originalPrice = booking.amountCents;
    const diffMs = newFlightDate.getTime() - booking.flight.departureTime.getTime();
    const dayDiff = Math.round(diffMs / (1000 * 60 * 60 * 24));
    const estimatedPriceChangePercent = dayDiff * 0.5;
    const estimatedNewPrice = Math.round(originalPrice * (1 + estimatedPriceChangePercent / 100));
    return estimatedNewPrice - originalPrice;
  }

  calculateCancellationRefund(booking: Booking): CancellationRefund {
    const flight = booking.flight;
    const rules = this.getApplicableFareRules(flight);
    if (rules.length === 0) {
      throw new BadRequestError('No fare rules found for this booking');
    }

    const fareRule = rules[0];
    const now = new Date();
    const departureTime = flight.departureTime;
    const daysToDeparture = Math.max(0, Math.ceil((departureTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const breakdown: { label: string; amount: number }[] = [];

    let refundPercentage = 0;
    let penaltyCents = 0;

    if (!fareRule.refundable) {
      if (daysToDeparture >= 60 || fareRule.cancellationFeePercentage === 100) {
        refundPercentage = 0;
        penaltyCents = booking.amountCents;
        breakdown.push({ label: 'Non-refundable fare', amount: booking.amountCents });
        return {
          refundableCents: 0,
          penaltyCents,
          netRefundCents: 0,
          currency: 'USD',
          breakdown,
          refundPercentage: 0,
          daysToDeparture,
          eligible: false,
          reason: 'Non-refundable fare class',
        };
      }

      const refundTiers = [
        { days: 60, percent: 100 }, { days: 30, percent: 75 },
        { days: 14, percent: 50 }, { days: 7, percent: 25 },
        { days: 3, percent: 10 }, { days: 0, percent: 0 },
      ];
      const tier = refundTiers.find(t => daysToDeparture >= t.days);
      refundPercentage = tier ? tier.percent : 0;
    } else {
      if (fareRule.cancellationFeePercentage > 0) {
        refundPercentage = 100 - fareRule.cancellationFeePercentage;
      } else if (fareRule.cancellationFeeCents > 0) {
        penaltyCents = fareRule.cancellationFeeCents;
        refundPercentage = 100 - Math.round((penaltyCents / booking.amountCents) * 100);
      } else {
        refundPercentage = 100;
      }
    }

    penaltyCents = Math.max(penaltyCents, Math.round(booking.amountCents * ((100 - refundPercentage) / 100)));
    const refundableCents = Math.round(booking.amountCents * (refundPercentage / 100));
    const netRefundCents = Math.max(0, refundableCents - penaltyCents);

    breakdown.push({ label: `Refund (${refundPercentage}% of ticket price)`, amount: refundableCents });
    if (penaltyCents > 0) {
      breakdown.push({ label: 'Cancellation penalty', amount: -penaltyCents });
    }

    return {
      refundableCents,
      penaltyCents,
      netRefundCents,
      currency: 'USD',
      breakdown,
      refundPercentage,
      daysToDeparture,
      eligible: netRefundCents > 0,
      reason: netRefundCents > 0 ? undefined : 'No value remaining after penalties',
    };
  }

  calculateFareDifference(booking: Booking, newFlight: Flight): FareDifference {
    const originalPrice = booking.amountCents;
    const newPrice = newFlight.priceCents;
    const fareDiff = newPrice - originalPrice;
    const breakdown: { label: string; amount: number }[] = [];

    const rules = this.getApplicableFareRules(booking.flight);
    let changeFeeCents = 0;
    if (rules.length > 0) {
      const rule = rules[0];
      changeFeeCents = rule.changeFeeCents || 0;
      if (rule.changeFeePercentage > 0) {
        changeFeeCents = Math.round(booking.amountCents * (rule.changeFeePercentage / 100));
      }
    }

    breakdown.push({ label: 'Original fare', amount: originalPrice });
    breakdown.push({ label: 'New fare', amount: newPrice });
    breakdown.push({ label: 'Fare difference', amount: fareDiff });
    if (changeFeeCents > 0) {
      breakdown.push({ label: 'Change fee', amount: changeFeeCents });
    }

    const totalDue = Math.max(0, fareDiff + changeFeeCents);

    return {
      fareDifferenceCents: fareDiff,
      newFlightPriceCents: newPrice,
      originalPriceCents: originalPrice,
      changeFeeCents,
      totalDueCents: totalDue,
      currency: 'USD',
      breakdown,
    };
  }

  calculateUpgradePrice(booking: Booking, targetClass: FareClass): UpgradeQuote {
    const flight = booking.flight;
    const currentFareClass = this.detectFareClass(flight);
    const rules = this.getApplicableFareRules(flight, targetClass);
    if (rules.length === 0) {
      throw new BadRequestError('No fare rules found for target class');
    }

    const breakdown: { label: string; amount: number }[] = [];
    const targetRule = rules[0];
    const classUpgradeMap: Record<FareClass, Record<FareClass, number>> = {
      economy: { economy: 0, premium_economy: 10000, business: 30000, first: 50000 },
      premium_economy: { economy: 0, premium_economy: 0, business: 20000, first: 40000 },
      business: { economy: 0, premium_economy: 0, business: 0, first: 20000 },
      first: { economy: 0, premium_economy: 0, business: 0, first: 0 },
    };

    const baseUpgradeFee = classUpgradeMap[currentFareClass]?.[targetClass] || 0;
    const upgradeFeeCents = Math.max(baseUpgradeFee, targetRule.upgradeFeeCents);

    breakdown.push({ label: `Upgrade from ${currentFareClass} to ${targetClass}`, amount: upgradeFeeCents });
    if (targetRule.upgradeFeeCents > 0 && targetRule.upgradeFeeCents !== upgradeFeeCents) {
      breakdown.push({ label: `Airline upgrade fee (${targetRule.airline})`, amount: targetRule.upgradeFeeCents });
    }
    breakdown.push({ label: 'Processing fee', amount: 500 });

    const totalDue = upgradeFeeCents + 500;

    return {
      upgradeFeeCents,
      fareDifferenceCents: upgradeFeeCents,
      totalDueCents: totalDue,
      currency: 'USD',
      fromClass: currentFareClass,
      toClass: targetClass,
      breakdown,
    };
  }

  private detectFareClass(flight: Flight): FareClass {
    const rawData = flight.rawData;
    if (rawData?.fareClass) {
      const fc = rawData.fareClass as string;
      if (['economy', 'premium_economy', 'business', 'first'].includes(fc)) {
        return fc as FareClass;
      }
    }
    return 'economy';
  }

  evaluateNoShowPolicy(booking: Booking): NoShowAssessment {
    const flight = booking.flight;
    const now = new Date();
    const departureTime = flight.departureTime;
    const rules = this.getApplicableFareRules(flight);
    const breakdown: { label: string; amount: number }[] = [];

    const isNoShow = now > departureTime;
    const graceEndTime = new Date(departureTime.getTime() + (rules[0]?.noShowGracePeriodMinutes || 0) * 60 * 1000);
    const gracePeriodExpired = now > graceEndTime;

    let penaltyCents = 0;
    if (isNoShow && gracePeriodExpired) {
      penaltyCents = Math.round(booking.amountCents * ((rules[0]?.noShowPenalty || 100) / 100));
      breakdown.push({ label: 'No-show penalty', amount: penaltyCents });
    } else if (isNoShow && !gracePeriodExpired) {
      breakdown.push({ label: 'Within grace period', amount: 0 });
    } else {
      breakdown.push({ label: 'Flight has not departed yet', amount: 0 });
    }

    return {
      isNoShow,
      penaltyCents,
      gracePeriodExpired,
      graceEndTime,
      breakdown,
    };
  }

  checkRefundEligibility(booking: Booking): RefundEligibility {
    const flight = booking.flight;
    const rules = this.getApplicableFareRules(flight);
    const conditions: string[] = [];

    if (rules.length === 0) {
      return {
        eligible: false,
        refundableCents: 0,
        nonRefundableCents: booking.amountCents,
        refundMethod: 'non_refundable',
        reason: 'No fare rules available for this ticket',
        conditions: ['No fare rules on file for this airline/fare class combination'],
      };
    }

    const fareRule = rules[0];
    const now = new Date();
    const departureTime = flight.departureTime;
    const daysToDeparture = Math.max(0, Math.ceil((departureTime.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    const isPastDeparture = now > departureTime;

    if (booking.status === 'refunded') {
      return {
        eligible: false,
        refundableCents: 0,
        nonRefundableCents: booking.amountCents,
        refundMethod: 'non_refundable',
        reason: 'Booking has already been refunded',
        conditions,
      };
    }

    if (isPastDeparture) {
      conditions.push('Flight has already departed. Subject to no-show policy.');
      if (fareRule.noShowPenalty >= 100) {
        return {
          eligible: false,
          refundableCents: 0,
          nonRefundableCents: booking.amountCents,
          refundMethod: 'non_refundable',
          reason: 'No refund available after departure for this fare class',
          conditions,
        };
      }
    }

    conditions.push(`Airline: ${fareRule.airline}`);
    conditions.push(`Fare Class: ${fareRule.fareClass} (${fareRule.fareBasisCode})`);
    conditions.push(`Refundable: ${fareRule.refundable ? 'Yes' : 'No'}`);

    if (fareRule.refundable) {
      const refundPct = fareRule.cancellationFeePercentage > 0
        ? (100 - fareRule.cancellationFeePercentage)
        : (fareRule.cancellationFeeCents > 0
          ? Math.round((1 - fareRule.cancellationFeeCents / booking.amountCents) * 100)
          : 100);

      if (refundPct >= 100) {
        conditions.push('Full refund available');
        return {
          eligible: true,
          refundableCents: booking.amountCents,
          nonRefundableCents: 0,
          refundMethod: 'full_refund',
          reason: 'Fully refundable fare',
          conditions,
        };
      }

      const refundableCents = Math.round(booking.amountCents * (refundPct / 100));
      conditions.push(`Partial refund: ${refundPct}% of ticket price`);
      return {
        eligible: true,
        refundableCents,
        nonRefundableCents: booking.amountCents - refundableCents,
        refundMethod: 'partial_refund',
        reason: `Partially refundable fare (${refundPct}%)`,
        conditions,
      };
    }

    if (daysToDeparture >= 60) {
      conditions.push('Free cancellation window (60+ days)');
      return {
        eligible: true,
        refundableCents: booking.amountCents,
        nonRefundableCents: 0,
        refundMethod: 'full_refund',
        reason: 'Cancellation within free cancellation window',
        conditions,
      };
    }

    if (daysToDeparture >= 14) {
      const voucherAmount = Math.round(booking.amountCents * 0.8);
      conditions.push(`Travel voucher available: $${(voucherAmount / 100).toFixed(2)} (80% of ticket value)`);
      return {
        eligible: false,
        refundableCents: voucherAmount,
        nonRefundableCents: booking.amountCents - voucherAmount,
        refundMethod: 'voucher',
        reason: 'Non-refundable fare, travel voucher offered instead',
        conditions,
      };
    }

    return {
      eligible: false,
      refundableCents: 0,
      nonRefundableCents: booking.amountCents,
      refundMethod: 'non_refundable',
      reason: 'Non-refundable fare with no exceptions applicable',
      conditions,
    };
  }
}
