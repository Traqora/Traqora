import { DataQualityService, ValidationRule } from '../../../src/services/analytics/dataQualityService';

const baseRules: ValidationRule[] = [
  { field: 'name', type: 'string', required: true },
  { field: 'age', type: 'number', required: true, min: 0, max: 150 },
  { field: 'email', type: 'string', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
];

describe('DataQualityService', () => {
  let svc: DataQualityService;

  beforeEach(() => {
    svc = new DataQualityService();
  });

  describe('scan() — validation', () => {
    it('returns 100 quality score for a clean dataset', () => {
      const records = [
        { name: 'Alice', age: 30, email: 'alice@example.com' },
        { name: 'Bob', age: 25, email: 'bob@example.com' },
      ];
      const result = svc.scan(records, { rules: baseRules });
      expect(result.qualityScore).toBe(100);
      expect(result.violations).toHaveLength(0);
    });

    it('flags missing required fields', () => {
      const records = [{ name: '', age: 30, email: 'x@y.com' }];
      const result = svc.scan(records, { rules: baseRules });
      expect(result.violations.some((v) => v.field === 'name' && v.rule === 'required')).toBe(true);
    });

    it('flags type violations', () => {
      const records = [{ name: 'Charlie', age: 'thirty', email: 'c@c.com' }];
      const result = svc.scan(records, { rules: baseRules });
      expect(result.violations.some((v) => v.field === 'age' && v.rule.startsWith('type'))).toBe(true);
    });

    it('flags range violations', () => {
      const records = [{ name: 'Dave', age: -5, email: 'd@d.com' }];
      const result = svc.scan(records, { rules: baseRules });
      expect(result.violations.some((v) => v.field === 'age' && v.rule.startsWith('min'))).toBe(true);
    });

    it('flags pattern violations', () => {
      const records = [{ name: 'Eve', age: 22, email: 'not-an-email' }];
      const result = svc.scan(records, { rules: baseRules });
      expect(result.violations.some((v) => v.field === 'email' && v.rule === 'pattern')).toBe(true);
    });

    it('flags custom rule violations', () => {
      const rules: ValidationRule[] = [
        { field: 'score', custom: (v) => typeof v === 'number' && v % 2 === 0 },
      ];
      const records = [{ score: 3 }];
      const result = svc.scan(records, { rules });
      expect(result.violations.some((v) => v.field === 'score' && v.rule === 'custom')).toBe(true);
    });

    it('returns 0 violations for an empty dataset', () => {
      const result = svc.scan([], { rules: baseRules });
      expect(result.violations).toHaveLength(0);
      expect(result.qualityScore).toBe(100);
    });
  });

  describe('scan() — duplicates', () => {
    it('detects duplicate records by composite key', () => {
      const records = [
        { id: '1', name: 'Alice', age: 30 },
        { id: '2', name: 'Alice', age: 30 },
        { id: '3', name: 'Bob', age: 25 },
      ];
      const result = svc.scan(records, { rules: [], duplicateKeyFields: ['name', 'age'] });
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].count).toBe(2);
    });

    it('does not flag unique records as duplicates', () => {
      const records = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];
      const result = svc.scan(records, { rules: [], duplicateKeyFields: ['name'] });
      expect(result.duplicates).toHaveLength(0);
    });
  });

  describe('scan() — freshness', () => {
    it('flags stale records', () => {
      const old = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      const records = [{ name: 'A', updatedAt: old }];
      const result = svc.scan(records, {
        rules: [],
        freshnessFields: [{ field: 'updatedAt', maxAgeMs: 24 * 60 * 60 * 1000 }],
      });
      expect(result.staleFields.length).toBeGreaterThan(0);
    });

    it('does not flag fresh records', () => {
      const fresh = new Date();
      const records = [{ name: 'A', updatedAt: fresh }];
      const result = svc.scan(records, {
        rules: [],
        freshnessFields: [{ field: 'updatedAt', maxAgeMs: 24 * 60 * 60 * 1000 }],
      });
      expect(result.staleFields).toHaveLength(0);
    });
  });

  describe('scan() — auto-fix', () => {
    it('trims whitespace from strings', () => {
      const records = [{ name: '  Alice  ', age: 30 }];
      svc.scan(records, { rules: baseRules, autoFix: true });
      expect(records[0].name).toBe('Alice');
    });

    it('reports auto-fixed count', () => {
      const records = [{ name: '  Alice  ', age: 30, email: 'a@a.com' }];
      const result = svc.scan(records, { rules: baseRules, autoFix: true });
      expect(result.autoFixedCount).toBeGreaterThan(0);
    });
  });

  describe('quality score', () => {
    it('reduces score proportionally to violations', () => {
      const records = Array.from({ length: 10 }, (_, i) => ({
        name: i < 5 ? '' : `Name ${i}`,
        age: 25,
        email: 'x@y.com',
      }));
      const result = svc.scan(records, { rules: baseRules });
      expect(result.qualityScore).toBeLessThan(100);
    });
  });

  describe('alerts', () => {
    it('emits an alert when score drops below threshold', () => {
      // First scan: clean data, establishes baseline
      svc.scan([{ name: 'Alice', age: 30, email: 'a@a.com' }], { rules: baseRules, alertThreshold: 90 });
      // Second scan: all bad data — score drops
      svc.scan([{ name: '', age: -1, email: 'bad' }], { rules: baseRules, alertThreshold: 90 });
      expect(svc.getAlerts().length).toBeGreaterThan(0);
    });

    it('clearAlerts empties the list', () => {
      svc.scan([{ name: 'Alice', age: 30, email: 'a@a.com' }], { rules: baseRules, alertThreshold: 90 });
      svc.scan([{ name: '', age: -1, email: 'bad' }], { rules: baseRules, alertThreshold: 90 });
      svc.clearAlerts();
      expect(svc.getAlerts()).toHaveLength(0);
    });
  });
});
