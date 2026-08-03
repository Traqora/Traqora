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

export interface SeasonalFareOverride {
  season: 'peak' | 'off_peak' | 'shoulder';
  name: string;
  changeFeeMultiplier: number;
  cancellationFeeMultiplier: number;
  upgradeDiscountPercent: number;
  validFrom: Date;
  validTo: Date;
}

export interface PromotionalFareOverride {
  promotionCode: string;
  name: string;
  changeFeeWaived: boolean;
  cancellationFeeWaived: boolean;
  upgradeDiscountCents: number;
  validUntil: Date;
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

export interface ChangeFeeTier {
  fromDays: number;
  toDays: number;
  feeCents: number;
  feePercentage: number;
  label: string;
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

export interface ParsedFareRuleResult {
  rules: FareRule[];
  warnings: string[];
}

export interface AirlineFareOverride {
  seasonal: SeasonalFareOverride[];
  promotional: PromotionalFareOverride[];
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
  BA: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'BA',
      changeable: true, refundable: false,
      changeFeeCents: 25000, cancellationFeeCents: 0, upgradeFeeCents: 20000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 45,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 355 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 12000,
      standbyAllowed: true, standbyFeeCents: 5000,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ES', airline: 'BA',
      changeable: true, refundable: true,
      changeFeeCents: 15000, cancellationFeeCents: 10000, upgradeFeeCents: 15000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 355 },
      changeFeePercentage: 0, cancellationFeePercentage: 50,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 7500,
      standbyAllowed: true, standbyFeeCents: 2500,
    },
    {
      fareClass: 'premium_economy', fareBasisCode: 'PE', airline: 'BA',
      changeable: true, refundable: true,
      changeFeeCents: 10000, cancellationFeeCents: 5000, upgradeFeeCents: 30000,
      noShowPenalty: 25, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 355 },
      changeFeePercentage: 0, cancellationFeePercentage: 25,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'J', airline: 'BA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 40000,
      noShowPenalty: 0, noShowGracePeriodMinutes: 15,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'first', fareBasisCode: 'F', airline: 'BA',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  LH: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'LH',
      changeable: true, refundable: false,
      changeFeeCents: 30000, cancellationFeeCents: 0, upgradeFeeCents: 25000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 60,
      restrictions: { advancePurchaseRequired: true, advancePurchaseDays: 1, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 15000,
      standbyAllowed: true, standbyFeeCents: 10000,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ER', airline: 'LH',
      changeable: true, refundable: true,
      changeFeeCents: 20000, cancellationFeeCents: 10000, upgradeFeeCents: 20000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 30,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 10000,
      standbyAllowed: true, standbyFeeCents: 5000,
    },
    {
      fareClass: 'premium_economy', fareBasisCode: 'PE', airline: 'LH',
      changeable: true, refundable: true,
      changeFeeCents: 10000, cancellationFeeCents: 0, upgradeFeeCents: 35000,
      noShowPenalty: 25, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 355 },
      changeFeePercentage: 0, cancellationFeePercentage: 20,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'J', airline: 'LH',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 50000,
      noShowPenalty: 0, noShowGracePeriodMinutes: 15,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'first', fareBasisCode: 'F', airline: 'LH',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  EK: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'EK',
      changeable: true, refundable: false,
      changeFeeCents: 35000, cancellationFeeCents: 0, upgradeFeeCents: 30000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 90,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: false, standbyFeeCents: 0,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ER', airline: 'EK',
      changeable: true, refundable: true,
      changeFeeCents: 15000, cancellationFeeCents: 10000, upgradeFeeCents: 20000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 60,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 25,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 10000,
      standbyAllowed: true, standbyFeeCents: 5000,
    },
    {
      fareClass: 'business', fareBasisCode: 'J', airline: 'EK',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 80000,
      noShowPenalty: 0, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'first', fareBasisCode: 'F', airline: 'EK',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 0,
      noShowPenalty: 0, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  B6: [
    {
      fareClass: 'economy', fareBasisCode: 'E', airline: 'B6',
      changeable: true, refundable: false,
      changeFeeCents: 10000, cancellationFeeCents: 0, upgradeFeeCents: 8000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 30,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 7500,
      standbyAllowed: true, standbyFeeCents: 5000,
    },
    {
      fareClass: 'economy', fareBasisCode: 'ER', airline: 'B6',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 5000,
      noShowPenalty: 50, noShowGracePeriodMinutes: 20,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 330 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
    {
      fareClass: 'business', fareBasisCode: 'M', airline: 'B6',
      changeable: true, refundable: true,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 20000,
      noShowPenalty: 0, noShowGracePeriodMinutes: 15,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 365 },
      changeFeePercentage: 0, cancellationFeePercentage: 0,
      rebookingAllowed: true, nameChangeAllowed: true, nameChangeFeeCents: 0,
      standbyAllowed: true, standbyFeeCents: 0,
    },
  ],
  FR: [
    {
      fareClass: 'economy', fareBasisCode: 'V', airline: 'FR',
      changeable: false, refundable: false,
      changeFeeCents: 0, cancellationFeeCents: 0, upgradeFeeCents: 5000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 0, nonRefundableIndicator: true },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: false, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: false, standbyFeeCents: 0,
    },
    {
      fareClass: 'economy', fareBasisCode: 'P', airline: 'FR',
      changeable: true, refundable: false,
      changeFeeCents: 5000, cancellationFeeCents: 0, upgradeFeeCents: 3000,
      noShowPenalty: 100, noShowGracePeriodMinutes: 0,
      restrictions: { advancePurchaseRequired: false, minStayDays: 0, maxStayDays: 0 },
      changeFeePercentage: 0, cancellationFeePercentage: 100,
      rebookingAllowed: true, nameChangeAllowed: false, nameChangeFeeCents: 0,
      standbyAllowed: false, standbyFeeCents: 0,
    },
  ],
};

export const SEASONAL_OVERRIDES: Record<string, AirlineFareOverride> = {
  DL: {
    seasonal: [
      {
        season: 'peak', name: 'Summer Peak',
        changeFeeMultiplier: 1.5, cancellationFeeMultiplier: 1.25, upgradeDiscountPercent: 0,
        validFrom: new Date('2024-06-01'), validTo: new Date('2024-08-31'),
      },
      {
        season: 'peak', name: 'Thanksgiving Week',
        changeFeeMultiplier: 2.0, cancellationFeeMultiplier: 1.5, upgradeDiscountPercent: 0,
        validFrom: new Date('2024-11-23'), validTo: new Date('2024-11-30'),
      },
      {
        season: 'peak', name: 'Christmas/New Year',
        changeFeeMultiplier: 2.0, cancellationFeeMultiplier: 1.5, upgradeDiscountPercent: 0,
        validFrom: new Date('2024-12-20'), validTo: new Date('2025-01-05'),
      },
    ],
    promotional: [],
  },
  AA: {
    seasonal: [
      {
        season: 'peak', name: 'Summer Peak',
        changeFeeMultiplier: 1.5, cancellationFeeMultiplier: 1.25, upgradeDiscountPercent: 0,
        validFrom: new Date('2024-06-01'), validTo: new Date('2024-08-31'),
      },
    ],
    promotional: [],
  },
};

const KNOWN_FARE_BASIS_PATTERNS: Record<string, RegExp[]> = {
  DL: [/^E\d*[A-Z]*$/, /^ER\d*$/, /^PE\d*$/, /^B\d*$/, /^F\d*$/],
  AA: [/^E\d*[A-Z]*$/, /^ER\d*$/, /^PE\d*$/, /^B\d*$/, /^F\d*$/],
  UA: [/^E\d*[A-Z]*$/, /^ER\d*$/, /^PE\d*$/, /^B\d*$/, /^F\d*$/],
  BA: [/^E\d*[A-Z]*$/, /^ES\d*$/, /^PE\d*$/, /^J\d*$/, /^F\d*$/],
  LH: [/^E\d*[A-Z]*$/, /^ER\d*$/, /^PE\d*$/, /^J\d*$/, /^F\d*$/, /^C\d*$/],
  EK: [/^E\d*[A-Z]*$/, /^ER\d*$/, /^J\d*$/, /^F\d*$/],
  WN: [/^WGA\d*$/, /^BS\d*$/, /^A\d*$/, /^W\d*$/],
  B6: [/^E\d*$/, /^ER\d*$/, /^M\d*$/],
  NK: [/^E\d*$/, /^V\d*$/],
  FR: [/^V\d*$/, /^P\d*$/, /^S\d*$/],
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

  parseAirlineFareRules(airlineCode: string, rawData: Record<string, any>): ParsedFareRuleResult {
    const warnings: string[] = [];
    const rules: FareRule[] = [];

    if (!airlineCode || !rawData) {
      return { rules: DEFAULT_FARE_RULES[airlineCode] || DEFAULT_FARE_RULES['DL'], warnings: ['No raw data provided, using defaults'] };
    }

    const rawFareClasses = rawData.fareClasses || rawData.fares || rawData.fareRules;
    if (!rawFareClasses) {
      warnings.push('No fare class data found in raw data, using default rules');
      return { rules: DEFAULT_FARE_RULES[airlineCode] || DEFAULT_FARE_RULES['DL'], warnings };
    }

    if (Array.isArray(rawFareClasses)) {
      for (const entry of rawFareClasses) {
        try {
          const rule = this.parseSingleFareRule(airlineCode, entry);
          if (rule) {
            rules.push(rule);
          } else {
            warnings.push(`Could not parse fare entry: ${JSON.stringify(entry)}`);
          }
        } catch (err: any) {
          warnings.push(`Error parsing fare entry: ${err.message}`);
        }
      }
    }

    if (rules.length === 0) {
      warnings.push('No rules could be parsed from raw data, falling back to defaults');
      return { rules: DEFAULT_FARE_RULES[airlineCode] || DEFAULT_FARE_RULES['DL'], warnings };
    }

    return { rules, warnings };
  }

  private parseSingleFareRule(airlineCode: string, entry: Record<string, any>): FareRule | null {
    const fareClass = this.inferFareClass(entry.fareBasisCode || entry.fareClass || '', airlineCode);
    if (!fareClass) return null;

    const fareBasisCode = entry.fareBasisCode || this.mapFareClassToBasisCode(fareClass, airlineCode) || fareClass.toUpperCase();

    return {
      fareClass,
      fareBasisCode,
      airline: airlineCode,
      changeable: entry.changeable !== false,
      refundable: entry.refundable === true || entry.refundable === 'YES',
      changeFeeCents: entry.changeFeeCents || entry.changeFee || 0,
      cancellationFeeCents: entry.cancellationFeeCents || entry.cancellationFee || 0,
      upgradeFeeCents: entry.upgradeFeeCents || entry.upgradeFee || 0,
      noShowPenalty: entry.noShowPenalty ?? 100,
      noShowGracePeriodMinutes: entry.noShowGracePeriodMinutes || 0,
      restrictions: {
        advancePurchaseRequired: entry.advancePurchaseRequired === true,
        advancePurchaseDays: entry.advancePurchaseDays,
        minStayDays: entry.minStayDays || 0,
        maxStayDays: entry.maxStayDays || 330,
        nonRefundableIndicator: entry.refundable === false || entry.refundable === 'NO',
      },
      changeFeePercentage: entry.changeFeePercentage || 0,
      cancellationFeePercentage: entry.cancellationFeePercentage || (entry.refundable ? 0 : 100),
      rebookingAllowed: entry.rebookingAllowed !== false,
      nameChangeAllowed: entry.nameChangeAllowed === true,
      nameChangeFeeCents: entry.nameChangeFeeCents || 0,
      standbyAllowed: entry.standbyAllowed !== false,
      standbyFeeCents: entry.standbyFeeCents || 0,
    };
  }

  private inferFareClass(fareBasisOrClass: string, airlineCode: string): FareClass | null {
    const normalized = fareBasisOrClass.toUpperCase().trim();
    const classMap: Record<string, FareClass> = {
      F: 'first', J: 'business', C: 'business', D: 'business',
      B: 'business', M: 'business',
      PE: 'premium_economy', W: 'premium_economy', S: 'premium_economy',
      Y: 'economy', E: 'economy', V: 'economy', P: 'economy',
      WGA: 'economy', BS: 'business',
    };

    if (normalized in classMap) return classMap[normalized];

    const patterns = KNOWN_FARE_BASIS_PATTERNS[airlineCode];
    if (patterns) {
      if (patterns[0]?.test(normalized)) return 'economy';
      if (patterns[1]?.test(normalized)) return 'economy';
      if (patterns[2]?.test(normalized)) return 'premium_economy';
      if (patterns[3]?.test(normalized)) return 'business';
      if (patterns[4]?.test(normalized)) return 'first';
    }

    return null;
  }

  private mapFareClassToBasisCode(fareClass: FareClass, airlineCode: AirlineCode): string | null {
    const basisMap: Record<string, Record<string, string>> = {
      DL: { economy: 'E', premium_economy: 'PE', business: 'B', first: 'F' },
      AA: { economy: 'E', premium_economy: 'PE', business: 'B', first: 'F' },
      UA: { economy: 'E', premium_economy: 'PE', business: 'B', first: 'F' },
      WN: { economy: 'WGA', business: 'BS' },
      NK: { economy: 'E' },
      BA: { economy: 'E', premium_economy: 'PE', business: 'J', first: 'F' },
      LH: { economy: 'E', premium_economy: 'PE', business: 'J', first: 'F' },
      EK: { economy: 'E', business: 'J', first: 'F' },
      B6: { economy: 'E', business: 'M' },
      FR: { economy: 'V' },
    };
    return basisMap[airlineCode]?.[fareClass] || null;
  }

  getActiveSeasonalOverride(flight: Flight): SeasonalFareOverride | null {
    const airlineOverrides = SEASONAL_OVERRIDES[flight.airlineCode];
    if (!airlineOverrides) return null;

    const now = new Date();
    for (const override of airlineOverrides.seasonal) {
      if (now >= override.validFrom && now <= override.validTo) {
        return override;
      }
    }
    return null;
  }

  getChangeFeeTiers(airlineCode: string, fareClass: FareClass): ChangeFeeTier[] {
    const rules = DEFAULT_FARE_RULES[airlineCode];
    if (!rules) return [];

    const rule = rules.find(r => r.fareClass === fareClass);
    if (!rule) return [];

    const baseFee = rule.changeFeeCents;
    const basePct = rule.changeFeePercentage;

    return [
      { fromDays: 60, toDays: 9999, feeCents: 0, feePercentage: 0, label: '60+ days before departure' },
      { fromDays: 30, toDays: 59, feeCents: baseFee * 0.5, feePercentage: basePct * 0.5, label: '30–59 days before departure' },
      { fromDays: 14, toDays: 29, feeCents: baseFee * 0.75, feePercentage: basePct * 0.75, label: '14–29 days before departure' },
      { fromDays: 7, toDays: 13, feeCents: baseFee, feePercentage: basePct, label: '7–13 days before departure' },
      { fromDays: 3, toDays: 6, feeCents: Math.round(baseFee * 1.25), feePercentage: basePct * 1.25, label: '3–6 days before departure' },
      { fromDays: 1, toDays: 2, feeCents: Math.round(baseFee * 1.5), feePercentage: basePct * 1.5, label: '1–2 days before departure' },
      { fromDays: 0, toDays: 0, feeCents: Math.round(baseFee * 2), feePercentage: basePct * 2, label: 'Day of departure' },
    ];
  }

  getCancellationTiers(airlineCode: string, fareClass: FareClass): { fromDays: number; toDays: number; refundPercentage: number; penaltyCents: number; label: string }[] {
    const rules = DEFAULT_FARE_RULES[airlineCode];
    if (!rules) return [];

    const rule = rules.find(r => r.fareClass === fareClass);
    if (!rule) return [];

    if (rule.refundable) {
      const penalty = rule.cancellationFeeCents;
      const pct = 100 - rule.cancellationFeePercentage;
      return [
        { fromDays: 60, toDays: 9999, refundPercentage: 100, penaltyCents: 0, label: '60+ days — full refund' },
        { fromDays: 30, toDays: 59, refundPercentage: pct, penaltyCents: penalty, label: '30–59 days' },
        { fromDays: 14, toDays: 29, refundPercentage: Math.round(pct * 0.75), penaltyCents: Math.round(penalty * 1.25), label: '14–29 days' },
        { fromDays: 0, toDays: 13, refundPercentage: Math.round(pct * 0.5), penaltyCents: Math.round(penalty * 1.5), label: 'Less than 14 days' },
      ];
    }

    return [
      { fromDays: 60, toDays: 9999, refundPercentage: 100, penaltyCents: 0, label: '60+ days — full refund (free cancellation window)' },
      { fromDays: 30, toDays: 59, refundPercentage: 75, penaltyCents: 0, label: '30–59 days — 75% refund' },
      { fromDays: 14, toDays: 29, refundPercentage: 50, penaltyCents: 0, label: '14–29 days — 50% refund' },
      { fromDays: 7, toDays: 13, refundPercentage: 25, penaltyCents: 0, label: '7–13 days — 25% refund' },
      { fromDays: 3, toDays: 6, refundPercentage: 10, penaltyCents: 0, label: '3–6 days — 10% refund' },
      { fromDays: 0, toDays: 2, refundPercentage: 0, penaltyCents: 0, label: 'Less than 3 days — no refund' },
    ];
  }

  calculateChangeFee(booking: Booking, newFlightDate: Date, newFlight?: Flight): ChangeFeeQuote {
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

    const seasonalOverride = this.getActiveSeasonalOverride(flight);
    const seasonalMultiplier = seasonalOverride?.changeFeeMultiplier || 1.0;
    const finalChangeFee = Math.round(adjustedFee * seasonalMultiplier);

    if (daysToDeparture >= 60) {
      breakdown.push({ label: 'Change fee (60+ days before departure)', amount: 0, explanation: 'Changes are free when made 60+ days before departure' });
    } else {
      const parts: string[] = [];
      if (feeFactor !== 1.0) {
        parts.push(`Base fee $${(fareRule.changeFeeCents / 100).toFixed(2)} adjusted by ${(feeFactor * 100).toFixed(0)}% time factor`);
      }
      if (seasonalMultiplier !== 1.0) {
        parts.push(`Seasonal multiplier (${seasonalOverride?.name || 'peak'}): ${seasonalMultiplier}x`);
      }
      breakdown.push({
        label: `Change fee (${daysToDeparture} days before departure)`,
        amount: finalChangeFee,
        explanation: parts.join('; ') || `Standard change fee of $${(fareRule.changeFeeCents / 100).toFixed(2)}`,
      });
    }

    let fareDifferenceCents = 0;
    if (newFlight) {
      fareDifferenceCents = newFlight.priceCents - booking.amountCents;
    } else {
      fareDifferenceCents = this.calculateFareDifferenceFromDate(booking, newFlightDate);
    }

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

    const totalDue = Math.max(0, finalChangeFee + fareDifferenceCents);

    return {
      changeFeeCents: finalChangeFee,
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

    const seasonalOverride = this.getActiveSeasonalOverride(flight);
    const seasonalPenaltyMultiplier = seasonalOverride?.cancellationFeeMultiplier || 1.0;

    let refundPercentage = 0;
    let penaltyCents = 0;

    if (this.isWithin24HourRiskFreeWindow(booking)) {
      refundPercentage = 100;
      breakdown.push({ label: '24-hour risk-free cancellation — full refund', amount: booking.amountCents });
      return {
        refundableCents: booking.amountCents,
        penaltyCents: 0,
        netRefundCents: booking.amountCents,
        currency: 'USD',
        breakdown,
        refundPercentage: 100,
        daysToDeparture,
        eligible: true,
        reason: '24-hour risk-free cancellation policy',
      };
    }

    if (!fareRule.refundable) {
      if (daysToDeparture >= 60) {
        refundPercentage = 100;
        breakdown.push({ label: 'Free cancellation window (60+ days)', amount: booking.amountCents });
      } else if (fareRule.cancellationFeePercentage >= 100) {
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
      } else {
        const refundTiers = [
          { days: 60, percent: 100 }, { days: 30, percent: 75 },
          { days: 14, percent: 50 }, { days: 7, percent: 25 },
          { days: 3, percent: 10 }, { days: 0, percent: 0 },
        ];
        const tier = refundTiers.find(t => daysToDeparture >= t.days);
        refundPercentage = tier ? tier.percent : 0;
      }
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

    if (daysToDeparture < 60 && seasonalPenaltyMultiplier > 1.0 && refundPercentage > 0) {
      const seasonalPenalty = Math.round(booking.amountCents * (refundPercentage / 100) * (seasonalPenaltyMultiplier - 1));
      penaltyCents += seasonalPenalty;
      breakdown.push({ label: `Seasonal penalty (${seasonalOverride?.name || 'peak'})`, amount: -seasonalPenalty });
    }

    penaltyCents = Math.max(penaltyCents, Math.round(booking.amountCents * ((100 - refundPercentage) / 100)));
    const refundableCents = Math.round(booking.amountCents * (refundPercentage / 100));
    const netRefundCents = Math.max(0, refundableCents - (penaltyCents > 0 ? penaltyCents : 0));

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

  private isWithin24HourRiskFreeWindow(booking: Booking): boolean {
    const now = new Date();
    const flightDate = booking.flight.departureTime;
    const msUntilDeparture = flightDate.getTime() - now.getTime();
    const daysUntilDeparture = msUntilDeparture / (1000 * 60 * 60 * 24);

    if (daysUntilDeparture < 1) return false;

    if (booking.createdAt) {
      const hoursSinceBooking = (now.getTime() - new Date(booking.createdAt).getTime()) / (1000 * 60 * 60);
      return hoursSinceBooking <= 24;
    }

    return false;
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

    const upgradePremiumPercentages: Record<FareClass, Record<FareClass, number>> = {
      economy: { economy: 0, premium_economy: 30, business: 80, first: 150 },
      premium_economy: { economy: 0, premium_economy: 0, business: 40, first: 100 },
      business: { economy: 0, premium_economy: 0, business: 0, first: 50 },
      first: { economy: 0, premium_economy: 0, business: 0, first: 0 },
    };

    const pricePercentIncrease = upgradePremiumPercentages[currentFareClass]?.[targetClass] || 0;
    const percentageBasedFee = Math.round(booking.amountCents * (pricePercentIncrease / 100));

    const staticUpgradeMap: Record<FareClass, Record<FareClass, number>> = {
      economy: { economy: 0, premium_economy: 10000, business: 30000, first: 50000 },
      premium_economy: { economy: 0, premium_economy: 0, business: 20000, first: 40000 },
      business: { economy: 0, premium_economy: 0, business: 0, first: 20000 },
      first: { economy: 0, premium_economy: 0, business: 0, first: 0 },
    };

    const staticFee = staticUpgradeMap[currentFareClass]?.[targetClass] || 0;
    const targetRuleFee = currentFareClass !== targetClass ? targetRule.upgradeFeeCents : 0;

    const upgradeFeeCents = Math.max(percentageBasedFee, staticFee, targetRuleFee);

    breakdown.push({ label: `Upgrade from ${currentFareClass} to ${targetClass}`, amount: upgradeFeeCents });
    if (pricePercentIncrease > 0) {
      breakdown.push({ label: `${pricePercentIncrease}% of current fare ($${(booking.amountCents / 100).toFixed(2)})`, amount: percentageBasedFee });
    }
    breakdown.push({ label: 'Processing fee', amount: 500 });

    const totalDue = upgradeFeeCents + 500;

    return {
      upgradeFeeCents,
      fareDifferenceCents: upgradeFeeCents + 500,
      totalDueCents: totalDue,
      currency: 'USD',
      fromClass: currentFareClass,
      toClass: targetClass,
      breakdown,
    };
  }

  private detectFareClass(flight: Flight): FareClass {
    const rawData = flight.rawData;
    const fareBasisCodes: Record<string, FareClass> = {
      F: 'first', J: 'business', C: 'business',
      PE: 'premium_economy', W: 'premium_economy', S: 'premium_economy',
      Y: 'economy', E: 'economy', V: 'economy',
      WGA: 'economy', BS: 'business', M: 'business',
    };

    if (rawData?.fareClass) {
      const fc = rawData.fareClass as string;
      if (['economy', 'premium_economy', 'business', 'first'].includes(fc)) {
        return fc as FareClass;
      }
    }

    if (rawData?.fareBasisCode && fareBasisCodes[rawData.fareBasisCode as string]) {
      return fareBasisCodes[rawData.fareBasisCode as string];
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
    const effectiveGraceMinutes = rules[0]?.noShowGracePeriodMinutes || 0;
    const graceEndTime = new Date(departureTime.getTime() + effectiveGraceMinutes * 60 * 1000);
    const gracePeriodExpired = now > graceEndTime;

    let penaltyCents = 0;
    if (isNoShow && gracePeriodExpired) {
      const penaltyPercent = rules[0]?.noShowPenalty || 100;
      penaltyCents = Math.round(booking.amountCents * (penaltyPercent / 100));
      breakdown.push({
        label: `No-show penalty (${penaltyPercent}% of ticket)`,
        amount: penaltyCents,
      });
    } else if (isNoShow && !gracePeriodExpired) {
      breakdown.push({
        label: 'Within grace period',
        amount: 0,
      });
    } else {
      const timeUntilDeparture = departureTime.getTime() - now.getTime();
      const hoursUntil = Math.round(timeUntilDeparture / (1000 * 60 * 60));
      breakdown.push({
        label: `Flight departs in ${hoursUntil}h — cancellation/change still available`,
        amount: 0,
      });
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

    conditions.push(`Airline: ${fareRule.airline}`);
    conditions.push(`Fare Class: ${fareRule.fareClass} (${fareRule.fareBasisCode})`);

    if (this.isWithin24HourRiskFreeWindow(booking)) {
      conditions.push('Within 24-hour risk-free cancellation window — full refund');
      return {
        eligible: true,
        refundableCents: booking.amountCents,
        nonRefundableCents: 0,
        refundMethod: 'full_refund',
        reason: '24-hour risk-free cancellation policy',
        conditions,
      };
    }

    if (booking.status === 'onchain_submitted' || booking.status === 'confirmed') {
      conditions.push('Booking confirmed on blockchain — refund subject to smart contract terms');
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
      conditions.push('Free cancellation window (60+ days before departure)');
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
