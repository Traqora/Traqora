import PriceHistory, { IPriceHistory } from '../models/PriceHistory';
import { logger } from '../utils/logger';

export interface FarePricePoint {
  date: string;
  price: number;
  currency: string;
}

export interface FareTrendSummary {
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
  currentPrice: number | null;
  dataPointCount: number;
}

export type TrendDirection = 'rising' | 'falling' | 'stable';
export type Recommendation = 'buy_now' | 'wait';
export type ConfidenceLabel = 'low' | 'medium' | 'high';

export interface PricePrediction {
  estimatedPrice: number;
  currency: string;
  confidence: number; // 0..1
  confidenceLabel: ConfidenceLabel;
  trendDirection: TrendDirection;
  recommendation: Recommendation;
  dataPointCount: number;
}

// A trend of less than this relative change is noise, not a real
// direction — avoids reporting "rising"/"falling" on tiny price jitter.
const TREND_THRESHOLD = 0.03;
// Confidence maxes out once we have this many data points (~2.5 days at
// the 5-minute price-monitor cron interval) — more history than this
// doesn't meaningfully improve confidence further.
const SAMPLE_SIZE_FOR_FULL_CONFIDENCE = 30;

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Fare price prediction and trend analytics (#376), built on the price
 * history `priceMonitor.ts` already accumulates every 5 minutes for any
 * flight with an active alert.
 *
 * This is deliberately a statistical baseline — a two-window trend
 * comparison plus a confidence score derived from sample size and price
 * stability — not a trained ML model. A real LSTM-style forecaster needs a
 * substantial historical corpus and a training/retraining pipeline that
 * don't exist yet; this service is the honest, working foundation that
 * approach would eventually replace, not a stand-in that pretends to be it.
 */
export class PricePredictionService {
  private static instance: PricePredictionService;

  private constructor() {}

  public static getInstance(): PricePredictionService {
    if (!PricePredictionService.instance) {
      PricePredictionService.instance = new PricePredictionService();
    }
    return PricePredictionService.instance;
  }

  /**
   * Loads price history for a flight/route within the last `windowDays`,
   * oldest first.
   */
  public async loadHistory(flightId: string, windowDays: number): Promise<IPriceHistory[]> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
    return PriceHistory.find({ flightId, timestamp: { $gte: since } })
      .sort({ timestamp: 1 })
      .exec();
  }

  /**
   * Fare trend data points + summary stats for a route/flight over the
   * given window. Returns an empty-but-valid shape (not an error) when no
   * history exists yet — a route nobody has an active alert on simply has
   * no data, which is a normal state, not a failure.
   */
  public async getFareTrend(
    flightId: string,
    windowDays: number,
  ): Promise<{ dataPoints: FarePricePoint[]; summary: FareTrendSummary }> {
    const history = await this.loadHistory(flightId, windowDays);
    return this.summarizeHistory(history);
  }

  /** Pure summary computation — separated from the DB read so it's directly unit-testable. */
  public summarizeHistory(history: IPriceHistory[]): {
    dataPoints: FarePricePoint[];
    summary: FareTrendSummary;
  } {
    const dataPoints: FarePricePoint[] = history.map((h) => ({
      date: h.timestamp.toISOString().slice(0, 10),
      price: h.price,
      currency: h.currency,
    }));

    if (dataPoints.length === 0) {
      return {
        dataPoints,
        summary: { minPrice: 0, maxPrice: 0, avgPrice: 0, currentPrice: null, dataPointCount: 0 },
      };
    }

    const prices = dataPoints.map((p) => p.price);
    return {
      dataPoints,
      summary: {
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        avgPrice: Math.round(average(prices)),
        currentPrice: prices[prices.length - 1] ?? null,
        dataPointCount: dataPoints.length,
      },
    };
  }

  /** Loads history for a flight and computes a prediction from it. */
  public async predict(flightId: string, currentPrice: number, currency: string): Promise<PricePrediction> {
    const history = await this.loadHistory(flightId, 90);
    logger.debug('price prediction computed', { flightId, dataPoints: history.length });
    return this.computePrediction(history, currentPrice, currency);
  }

  /**
   * Pure prediction computation — separated from the DB read so it's
   * directly unit-testable without mocking Mongoose.
   *
   * Trend: compares the average of the first half of the window to the
   * second half — a simple, explainable two-window comparison rather than
   * a full regression, since the noisy, sparse data this collects doesn't
   * warrant more sophistication than that.
   *
   * Confidence: the average of (a) how much history we have, relative to
   * `SAMPLE_SIZE_FOR_FULL_CONFIDENCE`, and (b) how stable the price has
   * been (low coefficient of variation → higher confidence). Both terms
   * matter: a lot of wildly swinging data points shouldn't score as
   * confidently as a little history of a genuinely stable price, or vice
   * versa.
   */
  public computePrediction(
    history: IPriceHistory[],
    currentPrice: number,
    currency: string,
  ): PricePrediction {
    if (history.length < 3) {
      // Not enough history to say anything meaningful — report the current
      // price back with low confidence rather than fabricating a trend.
      return {
        estimatedPrice: Math.round(currentPrice),
        currency,
        confidence: 0.1,
        confidenceLabel: 'low',
        trendDirection: 'stable',
        recommendation: 'buy_now',
        dataPointCount: history.length,
      };
    }

    const prices = history.map((h) => h.price);
    const n = prices.length;
    const mid = Math.floor(n / 2);
    const firstHalfAvg = average(prices.slice(0, mid));
    const secondHalfAvg = average(prices.slice(mid));
    const relativeDelta = firstHalfAvg === 0 ? 0 : (secondHalfAvg - firstHalfAvg) / firstHalfAvg;

    let trendDirection: TrendDirection = 'stable';
    if (relativeDelta > TREND_THRESHOLD) trendDirection = 'rising';
    else if (relativeDelta < -TREND_THRESHOLD) trendDirection = 'falling';

    const avgPrice = average(prices);
    const variance = average(prices.map((p) => (p - avgPrice) ** 2));
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgPrice === 0 ? 1 : stdDev / avgPrice;

    const sampleConfidence = Math.min(n / SAMPLE_SIZE_FOR_FULL_CONFIDENCE, 1);
    const stabilityConfidence = Math.max(0, 1 - coefficientOfVariation * 2);
    const confidence = Math.round(((sampleConfidence + stabilityConfidence) / 2) * 100) / 100;

    // Buy now if the trend is rising (waiting likely costs more) or the
    // current price is already at/below the historical average; otherwise
    // wait for it to come back down.
    const recommendation: Recommendation =
      trendDirection === 'rising' || currentPrice <= avgPrice ? 'buy_now' : 'wait';

    return {
      estimatedPrice: Math.round(avgPrice),
      currency,
      confidence,
      confidenceLabel: confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low',
      trendDirection,
      recommendation,
      dataPointCount: n,
    };
  }
}
