/**
 * Regression tests for the implementationPlansIndex utility (#716).
 *
 * Coverage:
 *  - lookupPlan: happy path, not-found, and every error case
 *  - listPlans: no filter, each filter field, combined filters
 *  - getPlansByPriority: happy path and error case
 *  - Structural invariants that must hold for the entire registry
 */

import {
  getPlansByPriority,
  InvalidFilterError,
  InvalidIssueNumberError,
  listPlans,
  lookupPlan,
  PlanEntry,
} from './implementationPlansIndex';

// ─── lookupPlan ───────────────────────────────────────────────────────────────

describe('lookupPlan', () => {
  // Happy path: every issue documented in IMPLEMENTATION_PLANS.md is findable.
  it.each([221, 223, 208, 209])(
    'returns a PlanEntry for known issue #%i',
    (issueNumber) => {
      const plan = lookupPlan(issueNumber);
      expect(plan).toBeDefined();
      expect(plan?.issueNumber).toBe(issueNumber);
    },
  );

  it('returns undefined for an issue number that has no plan', () => {
    expect(lookupPlan(9999)).toBeUndefined();
  });

  it('returns undefined for a valid positive integer not yet in the registry', () => {
    expect(lookupPlan(1)).toBeUndefined();
  });

  // Failure mode: non-positive integer
  it('throws InvalidIssueNumberError for zero', () => {
    expect(() => lookupPlan(0)).toThrow(InvalidIssueNumberError);
  });

  it('throws InvalidIssueNumberError for a negative integer', () => {
    expect(() => lookupPlan(-5)).toThrow(InvalidIssueNumberError);
  });

  it('throws InvalidIssueNumberError for a float', () => {
    expect(() => lookupPlan(3.14)).toThrow(InvalidIssueNumberError);
  });

  it('throws InvalidIssueNumberError for NaN', () => {
    expect(() => lookupPlan(NaN)).toThrow(InvalidIssueNumberError);
  });

  it('throws InvalidIssueNumberError for Infinity', () => {
    expect(() => lookupPlan(Infinity)).toThrow(InvalidIssueNumberError);
  });

  it('error message includes the bad value that was received', () => {
    try {
      lookupPlan(-1);
      fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidIssueNumberError);
      expect((err as InvalidIssueNumberError).message).toContain('-1');
    }
  });

  it('InvalidIssueNumberError has statusCode 400 and code INVALID_ISSUE_NUMBER', () => {
    const err = new InvalidIssueNumberError(0);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_ISSUE_NUMBER');
  });
});

// ─── listPlans ────────────────────────────────────────────────────────────────

describe('listPlans', () => {
  it('returns all 4 plans when called with no filter', () => {
    const all = listPlans();
    expect(all).toHaveLength(4);
  });

  it('returns plans sorted by implementationOrder ascending when no filter is given', () => {
    const all = listPlans();
    for (let i = 1; i < all.length; i++) {
      expect(all[i].implementationOrder).toBeGreaterThan(
        all[i - 1].implementationOrder,
      );
    }
  });

  it('returns plans sorted by implementationOrder ascending when a filter is applied', () => {
    const highPriority = listPlans({ priority: 'high' });
    for (let i = 1; i < highPriority.length; i++) {
      expect(highPriority[i].implementationOrder).toBeGreaterThan(
        highPriority[i - 1].implementationOrder,
      );
    }
  });

  // Filter by type
  it('filters by type "security" and returns only the security plan', () => {
    const result = listPlans({ type: 'security' });
    expect(result).toHaveLength(1);
    expect(result[0].issueNumber).toBe(221);
    expect(result[0].type).toBe('security');
  });

  it('filters by type "performance" and returns only the performance plan', () => {
    const result = listPlans({ type: 'performance' });
    expect(result).toHaveLength(1);
    expect(result[0].issueNumber).toBe(223);
  });

  it('filters by type "feature" and returns the two feature plans', () => {
    const result = listPlans({ type: 'feature' });
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.issueNumber).sort()).toEqual([208, 209]);
  });

  // Filter by priority
  it('filters by priority "high" and returns three plans', () => {
    const result = listPlans({ priority: 'high' });
    expect(result).toHaveLength(3);
    result.forEach((p) => expect(p.priority).toBe('high'));
  });

  it('filters by priority "medium" and returns one plan', () => {
    const result = listPlans({ priority: 'medium' });
    expect(result).toHaveLength(1);
    expect(result[0].issueNumber).toBe(223);
  });

  it('filters by priority "low" and returns an empty array', () => {
    expect(listPlans({ priority: 'low' })).toHaveLength(0);
  });

  // Filter by implementationOrder
  it('filters by implementationOrder 1 and returns exactly issue #221', () => {
    const result = listPlans({ implementationOrder: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].issueNumber).toBe(221);
  });

  it('filters by implementationOrder 5 (unused) and returns empty', () => {
    expect(listPlans({ implementationOrder: 5 })).toHaveLength(0);
  });

  // Combined filter
  it('combines type and priority filters correctly', () => {
    const result = listPlans({ type: 'feature', priority: 'high' });
    expect(result).toHaveLength(2);
    result.forEach((p) => {
      expect(p.type).toBe('feature');
      expect(p.priority).toBe('high');
    });
  });

  // Failure mode: invalid filter values
  it('throws InvalidFilterError for an unknown type value', () => {
    // @ts-expect-error intentional bad input for runtime validation test
    expect(() => listPlans({ type: 'unknown_type' })).toThrow(InvalidFilterError);
  });

  it('throws InvalidFilterError for an unknown priority value', () => {
    // @ts-expect-error intentional bad input for runtime validation test
    expect(() => listPlans({ priority: 'critical' })).toThrow(InvalidFilterError);
  });

  it('InvalidFilterError has statusCode 400 and code INVALID_PLAN_FILTER', () => {
    const err = new InvalidFilterError('type', 'bogus');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('INVALID_PLAN_FILTER');
  });

  it('error message names the bad field and includes the bad value', () => {
    try {
      // @ts-expect-error intentional bad input
      listPlans({ priority: 'urgent' });
      fail('expected to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidFilterError);
      expect((err as InvalidFilterError).message).toContain('priority');
      expect((err as InvalidFilterError).message).toContain('urgent');
    }
  });

  it('does not mutate the internal registry (calls are independent)', () => {
    const first = listPlans();
    const second = listPlans();
    // Each call returns a fresh array
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

// ─── getPlansByPriority ───────────────────────────────────────────────────────

describe('getPlansByPriority', () => {
  it('returns the same result as listPlans({ priority }) for "high"', () => {
    expect(getPlansByPriority('high')).toEqual(listPlans({ priority: 'high' }));
  });

  it('returns the same result as listPlans({ priority }) for "medium"', () => {
    expect(getPlansByPriority('medium')).toEqual(listPlans({ priority: 'medium' }));
  });

  it('returns an empty array for "low" (no low-priority plans registered)', () => {
    expect(getPlansByPriority('low')).toHaveLength(0);
  });

  it('throws InvalidFilterError for an unrecognised priority string', () => {
    // @ts-expect-error intentional bad input
    expect(() => getPlansByPriority('blocker')).toThrow(InvalidFilterError);
  });
});

// ─── Registry structural invariants ──────────────────────────────────────────

describe('registry structural invariants', () => {
  const all = listPlans();

  it('every plan has a unique issueNumber', () => {
    const numbers = all.map((p) => p.issueNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('every plan has a unique implementationOrder', () => {
    const orders = all.map((p) => p.implementationOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('implementationOrder values are exactly 1..N with no gaps', () => {
    const sorted = all.map((p) => p.implementationOrder).sort((a, b) => a - b);
    sorted.forEach((order, idx) => expect(order).toBe(idx + 1));
  });

  it('every declared dependency is itself a registered issue number', () => {
    const issueNumbers = new Set(all.map((p) => p.issueNumber));
    for (const plan of all) {
      for (const dep of plan.dependencies) {
        expect(issueNumbers.has(dep)).toBe(true);
      }
    }
  });

  it('dependencies never form a self-reference', () => {
    for (const plan of all) {
      expect(plan.dependencies).not.toContain(plan.issueNumber);
    }
  });

  it('every plan has a non-empty title', () => {
    all.forEach((p) => expect(p.title.trim().length).toBeGreaterThan(0));
  });

  it('every plan has a non-empty description', () => {
    all.forEach((p) => expect(p.description.trim().length).toBeGreaterThan(0));
  });

  it('every estimatedFiles range has min <= max', () => {
    all.forEach((p: PlanEntry) =>
      expect(p.estimatedFiles[0]).toBeLessThanOrEqual(p.estimatedFiles[1]),
    );
  });

  it('every estimatedWeeks range has min <= max', () => {
    all.forEach((p: PlanEntry) =>
      expect(p.estimatedWeeks[0]).toBeLessThanOrEqual(p.estimatedWeeks[1]),
    );
  });

  it('every issueNumber is a positive integer', () => {
    all.forEach((p) => {
      expect(p.issueNumber).toBeGreaterThan(0);
      expect(Number.isInteger(p.issueNumber)).toBe(true);
    });
  });
});
