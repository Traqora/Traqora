/**
 * Baggage allowance calculation (issue #387).
 *
 * Allowance is derived from cabin class, with optional per-airline
 * overrides. There is no live route-type (domestic/international)
 * distinction: the schema only stores IATA airport codes with no
 * country/region reference table, so a reliable domestic-vs-international
 * classification isn't available without adding one — noted as a scope
 * limitation rather than guessed at.
 */

export type CabinClass = 'economy' | 'premium_economy' | 'business' | 'first';

export interface BaggageAllowance {
  checkedBags: number;
  checkedWeightKgPerBag: number;
  carryOnBags: number;
  carryOnWeightKg: number;
  currency: string;
}

export interface BaggageFeeResult {
  allowance: BaggageAllowance;
  excessBags: number;
  excessWeightKg: number;
  feeCents: number;
}

const DEFAULT_ALLOWANCE_BY_CLASS: Record<CabinClass, BaggageAllowance> = {
  economy: { checkedBags: 1, checkedWeightKgPerBag: 23, carryOnBags: 1, carryOnWeightKg: 7, currency: 'USD' },
  premium_economy: { checkedBags: 2, checkedWeightKgPerBag: 23, carryOnBags: 1, carryOnWeightKg: 10, currency: 'USD' },
  business: { checkedBags: 2, checkedWeightKgPerBag: 32, carryOnBags: 2, carryOnWeightKg: 10, currency: 'USD' },
  first: { checkedBags: 3, checkedWeightKgPerBag: 32, carryOnBags: 2, carryOnWeightKg: 12, currency: 'USD' },
};

/** Per-airline overrides, keyed by IATA airline code. Mocked — no live airline policy API integration. */
const AIRLINE_OVERRIDES: Record<string, Partial<Record<CabinClass, Partial<BaggageAllowance>>>> = {
  BA: { economy: { checkedBags: 1, checkedWeightKgPerBag: 23 } },
  DL: { economy: { checkedBags: 2, checkedWeightKgPerBag: 23 } },
};

const EXCESS_BAG_FEE_CENTS = 6000;
const EXCESS_WEIGHT_FEE_CENTS_PER_KG = 1500;

export const RESTRICTION_NOTES = [
  'Liquids in carry-on baggage must be in containers of 100ml or less, in a single transparent resealable bag.',
  'Spare lithium batteries and power banks must be carried in carry-on baggage, not checked.',
  'Oversized items (exceeding standard linear dimensions) may incur additional handling fees regardless of weight.',
];

export class BaggageService {
  getAllowance(airlineCode: string, cabinClass: CabinClass): BaggageAllowance {
    const base = DEFAULT_ALLOWANCE_BY_CLASS[cabinClass] ?? DEFAULT_ALLOWANCE_BY_CLASS.economy;
    const override = AIRLINE_OVERRIDES[airlineCode?.toUpperCase()]?.[cabinClass];
    return override ? { ...base, ...override } : { ...base };
  }

  /**
   * Calculates excess-baggage fees for a passenger's declared bags against
   * their allowance. Weight excess is calculated per checked bag, using
   * the allowance's per-bag weight limit — a bag within its own weight
   * limit never incurs a weight fee even if other bags in the booking do.
   */
  calculateExcessFee(
    airlineCode: string,
    cabinClass: CabinClass,
    declaredBags: number,
    heaviestBagWeightKg: number,
  ): BaggageFeeResult {
    const allowance = this.getAllowance(airlineCode, cabinClass);

    const excessBags = Math.max(0, declaredBags - allowance.checkedBags);
    const excessWeightKg = Math.max(0, heaviestBagWeightKg - allowance.checkedWeightKgPerBag);

    const feeCents =
      excessBags * EXCESS_BAG_FEE_CENTS + Math.ceil(excessWeightKg) * EXCESS_WEIGHT_FEE_CENTS_PER_KG;

    return { allowance, excessBags, excessWeightKg, feeCents };
  }
}

export const baggageService = new BaggageService();
