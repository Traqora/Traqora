import { BaggageService, RESTRICTION_NOTES } from '../../src/services/baggageService';

describe('BaggageService', () => {
  let svc: BaggageService;

  beforeEach(() => {
    svc = new BaggageService();
  });

  describe('getAllowance', () => {
    it('returns economy defaults for an unknown airline', () => {
      const a = svc.getAllowance('XX', 'economy');
      expect(a.checkedBags).toBe(1);
      expect(a.checkedWeightKgPerBag).toBe(23);
      expect(a.carryOnBags).toBe(1);
    });

    it('returns more checked bags for business class', () => {
      const economy = svc.getAllowance('XX', 'economy');
      const business = svc.getAllowance('XX', 'business');
      expect(business.checkedBags).toBeGreaterThanOrEqual(economy.checkedBags);
      expect(business.checkedWeightKgPerBag).toBeGreaterThan(economy.checkedWeightKgPerBag);
    });

    it('returns the most generous allowance for first class', () => {
      const first = svc.getAllowance('XX', 'first');
      expect(first.checkedBags).toBeGreaterThanOrEqual(svc.getAllowance('XX', 'business').checkedBags);
    });

    it('applies airline-specific override for Delta economy (2 bags)', () => {
      const a = svc.getAllowance('DL', 'economy');
      expect(a.checkedBags).toBe(2);
    });

    it('applies airline-specific override for BA economy', () => {
      const a = svc.getAllowance('BA', 'economy');
      expect(a.checkedBags).toBe(1);
      expect(a.checkedWeightKgPerBag).toBe(23);
    });

    it('is case-insensitive for airline codes', () => {
      expect(svc.getAllowance('dl', 'economy')).toEqual(svc.getAllowance('DL', 'economy'));
    });
  });

  describe('calculateExcessFee', () => {
    it('returns zero fee when bags and weight are within allowance', () => {
      const result = svc.calculateExcessFee('XX', 'economy', 1, 20);
      expect(result.feeCents).toBe(0);
      expect(result.excessBags).toBe(0);
      expect(result.excessWeightKg).toBe(0);
    });

    it('charges per excess bag', () => {
      const result = svc.calculateExcessFee('XX', 'economy', 3, 20);
      expect(result.excessBags).toBe(2);
      expect(result.feeCents).toBeGreaterThan(0);
    });

    it('charges for weight over the per-bag limit', () => {
      const result = svc.calculateExcessFee('XX', 'economy', 1, 30);
      expect(result.excessWeightKg).toBeGreaterThan(0);
      expect(result.feeCents).toBeGreaterThan(0);
    });

    it('charges both excess bag and weight fees when both are exceeded', () => {
      const bagOnly = svc.calculateExcessFee('XX', 'economy', 3, 20);
      const weightOnly = svc.calculateExcessFee('XX', 'economy', 1, 30);
      const both = svc.calculateExcessFee('XX', 'economy', 3, 30);
      expect(both.feeCents).toBe(bagOnly.feeCents + weightOnly.feeCents);
    });

    it('returns the allowance in the result', () => {
      const result = svc.calculateExcessFee('DL', 'economy', 1, 10);
      expect(result.allowance.checkedBags).toBe(2);
    });
  });

  describe('RESTRICTION_NOTES', () => {
    it('has at least one restriction note', () => {
      expect(RESTRICTION_NOTES.length).toBeGreaterThan(0);
    });

    it('includes a note about liquids in carry-on', () => {
      const hasLiquids = RESTRICTION_NOTES.some(n => n.toLowerCase().includes('liquid'));
      expect(hasLiquids).toBe(true);
    });
  });
});
