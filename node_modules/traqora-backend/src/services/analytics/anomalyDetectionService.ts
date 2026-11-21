/**
 * Anomaly detection service — issue #249.
 *
 * Detects statistical outliers in revenue and distribution data using a
 * Z-score approach. Sensitivity is configurable via threshold (default 2.0).
 * Higher threshold → fewer alerts (less sensitive). Lower → more alerts.
 */

export interface AnomalyPoint {
  index: number;
  value: number;
  zScore: number;
  severity: 'low' | 'medium' | 'high';
}

export interface AnomalyReport {
  mean: number;
  stdDev: number;
  threshold: number;
  anomalies: AnomalyPoint[];
  totalPoints: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function stdDev(values: number[], mu: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((acc, v) => acc + (v - mu) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function severityFromZScore(z: number): 'low' | 'medium' | 'high' {
  const abs = Math.abs(z);
  if (abs >= 4) return 'high';
  if (abs >= 3) return 'medium';
  return 'low';
}

export class AnomalyDetectionService {
  /**
   * Detect outliers in a series of numeric values.
   * @param values     Array of measurements (revenue, distribution amounts, etc.)
   * @param threshold  Z-score threshold above which a point is flagged (default 2.0)
   */
  detect(values: number[], threshold = 2.0): AnomalyReport {
    const mu = mean(values);
    const sd = stdDev(values, mu);
    const anomalies: AnomalyPoint[] = [];

    for (let i = 0; i < values.length; i++) {
      const z = sd === 0 ? 0 : (values[i] - mu) / sd;
      if (Math.abs(z) > threshold) {
        anomalies.push({
          index: i,
          value: values[i],
          zScore: parseFloat(z.toFixed(4)),
          severity: severityFromZScore(z),
        });
      }
    }

    return {
      mean: parseFloat(mu.toFixed(4)),
      stdDev: parseFloat(sd.toFixed(4)),
      threshold,
      anomalies,
      totalPoints: values.length,
    };
  }

  /**
   * Record false-positive feedback for a flagged index.
   * In a real system this would retrain the model; here it updates an in-memory set.
   */
  private falsePositives: Set<string> = new Set();

  markFalsePositive(seriesKey: string, index: number): void {
    this.falsePositives.add(`${seriesKey}:${index}`);
  }

  isFalsePositive(seriesKey: string, index: number): boolean {
    return this.falsePositives.has(`${seriesKey}:${index}`);
  }
}
