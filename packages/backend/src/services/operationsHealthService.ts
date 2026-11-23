/**
 * Bounded, read-only health snapshot for the operations surface (#1172, #1173).
 * Only states and counters are exposed. No keys, signing material or upstream
 * error text is ever included in the snapshot.
 */

export type OperationsHealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';

export interface SupplierHealthData {
  lastSuccessfulRequest: Date | null;
  recentFailures: number;
  recentRequests: number;
}

export interface PaymentHealthData {
  circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'unavailable';
}

export interface ContractHealthData {
  available: boolean;
  lastReconciledAt: Date | null;
  needsReviewCount: number;
}

export interface OperationsHealthInput {
  supplier: SupplierHealthData;
  payment: PaymentHealthData;
  contract: ContractHealthData;
}

export interface OperationsHealthSnapshot {
  generatedAt: string;
  supplier: {
    lastSuccessfulRequest: string | null;
    currentHealth: OperationsHealthState;
    recentFailures: number;
    recentRequestWindow: number;
  };
  payment: {
    currentHealth: OperationsHealthState;
    circuitState: PaymentHealthData['circuitState'];
  };
  contract: {
    currentHealth: OperationsHealthState;
    lastReconciledAt: string | null;
    needsReviewCount: number;
  };
}

export interface OperationsHealthSources {
  supplier: () => Promise<SupplierHealthData>;
  payment: () => Promise<PaymentHealthData>;
  contract: () => Promise<ContractHealthData>;
}

export const OPERATIONS_HEALTH_TTL_MS = 15_000;
export const MAX_SUPPLIER_REQUESTS = 20;

const recentSupplierRequests: boolean[] = [];
let lastSupplierSuccess: Date | null = null;

/** Append one supplier request outcome, keeping only a bounded recent window. */
export function recordSupplierRequest(succeeded: boolean, at: Date = new Date()): void {
  recentSupplierRequests.push(succeeded);
  if (recentSupplierRequests.length > MAX_SUPPLIER_REQUESTS) {
    recentSupplierRequests.shift();
  }
  if (succeeded) lastSupplierSuccess = at;
}

export function getSupplierRequestData(): SupplierHealthData {
  return {
    lastSuccessfulRequest: lastSupplierSuccess,
    recentFailures: recentSupplierRequests.filter((succeeded) => !succeeded).length,
    recentRequests: recentSupplierRequests.length,
  };
}

function supplierState(data: SupplierHealthData): OperationsHealthState {
  if (data.recentRequests === 0) return 'unavailable';
  if (data.recentFailures >= 3) return 'unhealthy';
  if (data.recentFailures > 0) return 'degraded';
  return 'healthy';
}

function paymentState(data: PaymentHealthData): OperationsHealthState {
  switch (data.circuitState) {
    case 'CLOSED': return 'healthy';
    case 'HALF_OPEN': return 'degraded';
    case 'OPEN': return 'unhealthy';
    default: return 'unavailable';
  }
}

/** Pure mapping so the states can be verified without live dependencies. */
export function computeOperationsHealth(
  input: OperationsHealthInput,
  now: Date = new Date()
): OperationsHealthSnapshot {
  return {
    generatedAt: now.toISOString(),
    supplier: {
      lastSuccessfulRequest: input.supplier.lastSuccessfulRequest?.toISOString() ?? null,
      currentHealth: supplierState(input.supplier),
      recentFailures: Math.min(input.supplier.recentFailures, MAX_SUPPLIER_REQUESTS),
      recentRequestWindow: MAX_SUPPLIER_REQUESTS,
    },
    payment: {
      currentHealth: paymentState(input.payment),
      circuitState: input.payment.circuitState,
    },
    contract: {
      currentHealth: !input.contract.available
        ? 'unavailable'
        : input.contract.needsReviewCount > 0
          ? 'degraded'
          : 'healthy',
      lastReconciledAt: input.contract.lastReconciledAt?.toISOString() ?? null,
      needsReviewCount: Math.max(0, input.contract.needsReviewCount),
    },
  };
}

let cached: { at: number; value: OperationsHealthSnapshot } | undefined;
let inflight: Promise<OperationsHealthSnapshot> | undefined;

/** Return a short-lived cached snapshot to avoid hammering upstream services. */
export async function getOperationsHealth(
  sources: OperationsHealthSources,
  nowMs: () => number = Date.now
): Promise<OperationsHealthSnapshot> {
  if (cached && nowMs() - cached.at < OPERATIONS_HEALTH_TTL_MS) return cached.value;
  if (inflight) return inflight;

  inflight = (async () => {
    const [supplier, payment, contract] = await Promise.all([
      sources.supplier(),
      sources.payment(),
      sources.contract(),
    ]);
    const value = computeOperationsHealth({ supplier, payment, contract });
    cached = { at: nowMs(), value };
    return value;
  })().finally(() => {
    inflight = undefined;
  });

  return inflight;
}

/** Test seam for resetting process-local cache and counters. */
export function resetOperationsHealth(): void {
  cached = undefined;
  inflight = undefined;
  recentSupplierRequests.length = 0;
  lastSupplierSuccess = null;
}
