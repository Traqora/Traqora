/**
 * Implementation Plans Index (#716)
 *
 * A typed, in-process registry of the implementation plans documented in
 * `IMPLEMENTATION_PLANS.md`.  Each plan entry is the canonical source of
 * truth for its issue number, type, priority, complexity, approximate file
 * count, and recommended implementation order.
 *
 * ## Contract
 *
 * ### Inputs
 * - `lookupPlan(issueNumber: number): PlanEntry | undefined`
 *   Accepts a positive integer issue number; returns the matching entry or
 *   `undefined` if no plan is registered for that number.
 *
 * - `listPlans(filter?: PlanFilter): PlanEntry[]`
 *   Returns all registered plans, optionally filtered by `type`, `priority`,
 *   or `implementationOrder`.  An empty filter object (or no argument) returns
 *   all plans sorted by `implementationOrder` ascending.
 *
 * - `getPlansByPriority(priority: Priority): PlanEntry[]`
 *   Convenience wrapper: returns all plans matching the given priority, sorted
 *   by `implementationOrder`.
 *
 * ### Outputs
 * - `PlanEntry` — a fully-typed object (see below); never `null`.
 * - Arrays returned by `listPlans` and `getPlansByPriority` are always sorted
 *   by `implementationOrder` ascending.  Empty input produces an empty array.
 *
 * ### Error cases
 * - `lookupPlan` receives a non-positive or non-integer value →
 *   throws `InvalidIssueNumberError`.
 * - `lookupPlan` receives a value that is out of range for a safe integer →
 *   throws `InvalidIssueNumberError`.
 * - `listPlans` receives an unknown `type` or `priority` in the filter →
 *   throws `InvalidFilterError`.
 *
 * These errors extend the existing `AppError` / `NotFoundError` pattern from
 * `src/utils/errors.ts` so they surface consistently through `errorHandler`.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type IssueType = 'performance' | 'feature' | 'security';
export type Priority = 'low' | 'medium' | 'high';
export type Complexity = 'low' | 'medium' | 'high';

export interface PlanEntry {
  /** GitHub issue number (positive integer). */
  issueNumber: number;
  /** Short human-readable title. */
  title: string;
  /** Category of change. */
  type: IssueType;
  /** Deployment urgency. */
  priority: Priority;
  /** Implementation effort estimate. */
  complexity: Complexity;
  /** Approximate number of files created or modified. */
  estimatedFiles: [number, number]; // [min, max]
  /** Estimated calendar weeks to complete. */
  estimatedWeeks: [number, number]; // [min, max]
  /**
   * 1-based position in the recommended implementation order.
   * Lower numbers should be started first.
   */
  implementationOrder: number;
  /** Issues (by number) that this plan depends on. */
  dependencies: number[];
  /** Single-paragraph description matching IMPLEMENTATION_PLANS.md. */
  description: string;
}

export interface PlanFilter {
  type?: IssueType;
  priority?: Priority;
  implementationOrder?: number;
}

// ─── Custom errors ────────────────────────────────────────────────────────────

export class InvalidIssueNumberError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_ISSUE_NUMBER';

  constructor(received: unknown) {
    super(
      `Issue number must be a positive safe integer; received: ${JSON.stringify(received)}`,
    );
    this.name = 'InvalidIssueNumberError';
  }
}

export class InvalidFilterError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_PLAN_FILTER';

  constructor(field: string, received: unknown) {
    super(
      `Unknown filter value for field "${field}": ${JSON.stringify(received)}`,
    );
    this.name = 'InvalidFilterError';
  }
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * The canonical set of plans sourced directly from `IMPLEMENTATION_PLANS.md`.
 * Sorted by `implementationOrder` so binary search is possible if the list
 * ever grows; for the current size a linear scan is perfectly fast.
 */
const PLANS: readonly PlanEntry[] = [
  {
    issueNumber: 221,
    title: 'Add Input Sanitization and Validation',
    type: 'security',
    priority: 'high',
    complexity: 'medium',
    estimatedFiles: [8, 12],
    estimatedWeeks: [2, 3],
    implementationOrder: 1,
    dependencies: [],
    description:
      'Comprehensive server-side validation, output encoding, and injection prevention ' +
      'across all API endpoints. Includes Zod sanitization schemas, SQL/NoSQL injection ' +
      'guards, CSP/CORS hardening, security audit logging, and per-endpoint rate limits.',
  },
  {
    issueNumber: 223,
    title: 'Add Database Query Optimization',
    type: 'performance',
    priority: 'medium',
    complexity: 'medium',
    estimatedFiles: [5, 8],
    estimatedWeeks: [2, 3],
    implementationOrder: 2,
    dependencies: [],
    description:
      'Improve database query performance through missing composite indexes, elimination ' +
      'of N+1 patterns in key repositories, and TypeORM connection-pool tuning. ' +
      'Delivered as a migration file plus updated repositories and dataSource config.',
  },
  {
    issueNumber: 208,
    title: 'Implement Multi-City Flight Booking',
    type: 'feature',
    priority: 'high',
    complexity: 'high',
    estimatedFiles: [12, 18],
    estimatedWeeks: [4, 5],
    implementationOrder: 3,
    dependencies: [221, 223],
    description:
      'Allow passengers to book multiple flight segments in a single atomic transaction ' +
      'with combined pricing and refund handling. Requires new MultiCityBooking and ' +
      'BookingSegment entities, a dedicated service, REST endpoints, frontend pages, and ' +
      'Soroban contract support for linked bookings.',
  },
  {
    issueNumber: 209,
    title: 'Add Real-Time Flight Status Updates',
    type: 'feature',
    priority: 'high',
    complexity: 'high',
    estimatedFiles: [10, 15],
    estimatedWeeks: [3, 4],
    implementationOrder: 4,
    dependencies: [221],
    description:
      'Real-time notifications for flight status changes (delays, gate changes, ' +
      'cancellations) via WebSocket. Includes a FlightStatusHistory entity, a sync job ' +
      'polling external APIs, push notifications for material changes, and a React hook ' +
      'for the client.',
  },
] as const;

// ─── Validation helpers ───────────────────────────────────────────────────────

const VALID_TYPES = new Set<string>(['performance', 'feature', 'security']);
const VALID_PRIORITIES = new Set<string>(['low', 'medium', 'high']);

function assertValidIssueNumber(value: unknown): asserts value is number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value <= 0 ||
    !Number.isSafeInteger(value)
  ) {
    throw new InvalidIssueNumberError(value);
  }
}

function assertValidFilter(filter: PlanFilter): void {
  if (filter.type !== undefined && !VALID_TYPES.has(filter.type)) {
    throw new InvalidFilterError('type', filter.type);
  }
  if (filter.priority !== undefined && !VALID_PRIORITIES.has(filter.priority)) {
    throw new InvalidFilterError('priority', filter.priority);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the plan registered for `issueNumber`, or `undefined` if none
 * exists.
 *
 * @throws {InvalidIssueNumberError} when `issueNumber` is not a positive safe integer.
 */
export function lookupPlan(issueNumber: number): PlanEntry | undefined {
  assertValidIssueNumber(issueNumber);
  return PLANS.find((p) => p.issueNumber === issueNumber);
}

/**
 * Returns all registered plans, optionally narrowed by `filter`.
 * Result is always sorted by `implementationOrder` ascending.
 *
 * @throws {InvalidFilterError} when `filter` contains an unrecognised field value.
 */
export function listPlans(filter: PlanFilter = {}): PlanEntry[] {
  assertValidFilter(filter);

  return [...PLANS]
    .filter((p) => {
      if (filter.type !== undefined && p.type !== filter.type) return false;
      if (filter.priority !== undefined && p.priority !== filter.priority) return false;
      if (
        filter.implementationOrder !== undefined &&
        p.implementationOrder !== filter.implementationOrder
      )
        return false;
      return true;
    })
    .sort((a, b) => a.implementationOrder - b.implementationOrder);
}

/**
 * Returns all plans with the given priority, sorted by `implementationOrder`.
 *
 * @throws {InvalidFilterError} when `priority` is not a known value.
 */
export function getPlansByPriority(priority: Priority): PlanEntry[] {
  return listPlans({ priority });
}
