/**
 * Data Quality Monitoring service — issue #253.
 *
 * Provides:
 *  - Configurable validation rules (type, range, regex, custom predicate)
 *  - Duplicate detection by composite key
 *  - Missing-value detection
 *  - Data freshness checks
 *  - Quality score calculation (0–100)
 *  - Alert emission when score degrades below a threshold
 *  - Auto-fix for common issues (trim whitespace, normalize nullish values)
 */

export type FieldType = 'string' | 'number' | 'boolean' | 'date';

export interface ValidationRule {
  field: string;
  type?: FieldType;
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  custom?: (value: unknown) => boolean;
}

export interface ValidationViolation {
  field: string;
  rule: string;
  value: unknown;
}

export interface DuplicateGroup {
  key: string;
  count: number;
  indices: number[];
}

export interface QualityScanResult {
  totalRecords: number;
  validRecords: number;
  qualityScore: number;
  violations: ValidationViolation[];
  duplicates: DuplicateGroup[];
  staleFields: string[];
  autoFixedCount: number;
}

export interface QualityAlert {
  triggeredAt: Date;
  previousScore: number;
  currentScore: number;
  threshold: number;
}

export interface DataQualityConfig {
  rules: ValidationRule[];
  duplicateKeyFields?: string[];
  freshnessFields?: Array<{ field: string; maxAgeMs: number }>;
  alertThreshold?: number;
  autoFix?: boolean;
}

const EMPTY_VALUES = new Set([null, undefined, '', 'null', 'undefined', 'N/A', 'n/a']);

function coerceType(value: unknown, type: FieldType): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return value instanceof Date || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));
    default:
      return true;
  }
}

function isBlank(value: unknown): boolean {
  return EMPTY_VALUES.has(value as string);
}

export class DataQualityService {
  private lastScore: number | null = null;
  private readonly alerts: QualityAlert[] = [];

  /**
   * Runs a full quality scan against a dataset using the provided config.
   * Mutates records in place when autoFix is enabled.
   */
  scan(records: Record<string, unknown>[], config: DataQualityConfig): QualityScanResult {
    const { rules, duplicateKeyFields = [], freshnessFields = [], alertThreshold = 80, autoFix = false } = config;
    const violations: ValidationViolation[] = [];
    let autoFixedCount = 0;

    // Auto-fix pass: trim strings and normalise nullish sentinels
    if (autoFix) {
      for (const record of records) {
        for (const [k, v] of Object.entries(record)) {
          if (typeof v === 'string') {
            const trimmed = v.trim();
            if (trimmed !== v) {
              record[k] = trimmed;
              autoFixedCount++;
            }
            if (EMPTY_VALUES.has(record[k] as string) && record[k] !== null && record[k] !== undefined) {
              record[k] = null;
              autoFixedCount++;
            }
          }
        }
      }
    }

    // Validation
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      for (const rule of rules) {
        const value = record[rule.field];

        if (rule.required && isBlank(value)) {
          violations.push({ field: rule.field, rule: 'required', value });
          continue;
        }
        if (isBlank(value)) continue;

        if (rule.type && !coerceType(value, rule.type)) {
          violations.push({ field: rule.field, rule: `type:${rule.type}`, value });
          continue;
        }

        if (rule.min !== undefined && typeof value === 'number' && value < rule.min) {
          violations.push({ field: rule.field, rule: `min:${rule.min}`, value });
        }
        if (rule.max !== undefined && typeof value === 'number' && value > rule.max) {
          violations.push({ field: rule.field, rule: `max:${rule.max}`, value });
        }
        if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value)) {
          violations.push({ field: rule.field, rule: 'pattern', value });
        }
        if (rule.custom && !rule.custom(value)) {
          violations.push({ field: rule.field, rule: 'custom', value });
        }
      }
    }

    // Duplicate detection
    const duplicates: DuplicateGroup[] = [];
    if (duplicateKeyFields.length > 0) {
      const seen = new Map<string, number[]>();
      for (let i = 0; i < records.length; i++) {
        const key = duplicateKeyFields.map((f) => String(records[i][f] ?? '')).join('|');
        const bucket = seen.get(key) ?? [];
        bucket.push(i);
        seen.set(key, bucket);
      }
      for (const [key, indices] of seen.entries()) {
        if (indices.length > 1) {
          duplicates.push({ key, count: indices.length, indices });
        }
      }
    }

    // Freshness checks
    const staleFields: string[] = [];
    const now = Date.now();
    for (const { field, maxAgeMs } of freshnessFields) {
      const staleCount = records.filter((r) => {
        const v = r[field];
        if (!v) return true;
        const ts = v instanceof Date ? v.getTime() : Date.parse(String(v));
        return Number.isNaN(ts) || now - ts > maxAgeMs;
      }).length;
      if (staleCount > 0) {
        staleFields.push(`${field}(${staleCount}/${records.length})`);
      }
    }

    // Quality score: fraction of records with no violations × 100, penalised by duplicates + stale
    const violatedIndices = new Set<number>();
    for (const v of violations) {
      const idx = records.findIndex((r) => r[v.field] === v.value);
      if (idx !== -1) violatedIndices.add(idx);
    }
    const dupeIndices = new Set(duplicates.flatMap((d) => d.indices.slice(1)));
    const badCount = new Set([...violatedIndices, ...dupeIndices]).size;
    const validRecords = Math.max(0, records.length - badCount);
    const qualityScore = records.length === 0 ? 100 : Math.round((validRecords / records.length) * 100);

    // Alert if score degraded below threshold
    if (this.lastScore !== null && qualityScore < alertThreshold && qualityScore < this.lastScore) {
      this.alerts.push({
        triggeredAt: new Date(),
        previousScore: this.lastScore,
        currentScore: qualityScore,
        threshold: alertThreshold,
      });
    }
    this.lastScore = qualityScore;

    return { totalRecords: records.length, validRecords, qualityScore, violations, duplicates, staleFields, autoFixedCount };
  }

  getAlerts(): QualityAlert[] {
    return [...this.alerts];
  }

  clearAlerts(): void {
    this.alerts.length = 0;
  }

  getLastScore(): number | null {
    return this.lastScore;
  }
}
