/**
 * Attribution Modeling service — issue #254.
 *
 * Tracks revenue touchpoints and calculates ROI per source/campaign using
 * three attribution models:
 *
 *   first-touch  — 100% credit to the first touchpoint in a journey
 *   last-touch   — 100% credit to the last touchpoint
 *   multi-touch  — even credit split across all touchpoints (linear model)
 *   custom       — caller-supplied weight function per touchpoint position
 *
 * All data is held in memory; swap for a DB in production.
 */

export type AttributionModel = 'first-touch' | 'last-touch' | 'multi-touch' | 'custom';

export interface Touchpoint {
  source: string;
  campaign: string;
  timestamp: Date;
}

export interface Conversion {
  id: string;
  revenueCents: number;
  touchpoints: Touchpoint[];
  convertedAt: Date;
}

export interface AttributionResult {
  source: string;
  campaign: string;
  attributedRevenueCents: number;
  conversionCount: number;
  roiPercent: number | null;
}

export interface AttributionReport {
  model: AttributionModel;
  results: AttributionResult[];
  totalRevenueCents: number;
}

export interface CostRecord {
  source: string;
  campaign: string;
  costCents: number;
}

type WeightFn = (index: number, total: number) => number;

const MODELS: Record<Exclude<AttributionModel, 'custom'>, WeightFn> = {
  'first-touch': (i) => (i === 0 ? 1 : 0),
  'last-touch': (i, total) => (i === total - 1 ? 1 : 0),
  'multi-touch': (_i, total) => 1 / total,
};

export class AttributionService {
  private readonly conversions: Conversion[] = [];
  private readonly costs: CostRecord[] = [];

  recordConversion(conversion: Conversion): void {
    this.conversions.push(conversion);
  }

  recordCost(cost: CostRecord): void {
    this.costs.push(cost);
  }

  /**
   * Generates an attribution report for all recorded conversions.
   *
   * @param model - The attribution model to apply.
   * @param customWeightFn - Required when model === 'custom'. Weights need not
   *   sum to 1; the method normalises them.
   */
  buildReport(model: AttributionModel, customWeightFn?: WeightFn): AttributionReport {
    const weightFn: WeightFn =
      model === 'custom'
        ? (customWeightFn ?? ((_i, total) => 1 / total))
        : MODELS[model];

    const totals = new Map<string, { revenueCents: number; conversions: number }>();

    for (const conversion of this.conversions) {
      const { touchpoints, revenueCents } = conversion;
      if (touchpoints.length === 0) continue;

      const rawWeights = touchpoints.map((_, i) => weightFn(i, touchpoints.length));
      const weightSum = rawWeights.reduce((s, w) => s + w, 0);

      touchpoints.forEach((tp, i) => {
        const normalised = weightSum === 0 ? 0 : rawWeights[i] / weightSum;
        const credit = Math.round(revenueCents * normalised);
        const key = `${tp.source}||${tp.campaign}`;
        const existing = totals.get(key) ?? { revenueCents: 0, conversions: 0 };
        existing.revenueCents += credit;
        if (normalised > 0) existing.conversions += 1;
        totals.set(key, existing);
      });
    }

    const totalRevenueCents = this.conversions.reduce((s, c) => s + c.revenueCents, 0);

    const results: AttributionResult[] = Array.from(totals.entries()).map(([key, val]) => {
      const [source, campaign] = key.split('||');
      const totalCostCents = this.costs
        .filter((c) => c.source === source && c.campaign === campaign)
        .reduce((s, c) => s + c.costCents, 0);
      const roiPercent =
        totalCostCents > 0
          ? Math.round(((val.revenueCents - totalCostCents) / totalCostCents) * 100)
          : null;
      return { source, campaign, attributedRevenueCents: val.revenueCents, conversionCount: val.conversions, roiPercent };
    });

    results.sort((a, b) => b.attributedRevenueCents - a.attributedRevenueCents);

    return { model, results, totalRevenueCents };
  }

  /**
   * Compares two attribution models side-by-side for the same dataset.
   * Useful for model evaluation without re-recording data.
   */
  compareModels(a: AttributionModel, b: AttributionModel): { a: AttributionReport; b: AttributionReport } {
    return { a: this.buildReport(a), b: this.buildReport(b) };
  }

  getConversions(): Conversion[] {
    return [...this.conversions];
  }

  clearData(): void {
    this.conversions.length = 0;
    this.costs.length = 0;
  }
}
