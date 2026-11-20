import {
  computeOperationsHealth,
  getOperationsHealth,
  getSupplierRequestData,
  MAX_SUPPLIER_REQUESTS,
  OPERATIONS_HEALTH_TTL_MS,
  recordSupplierRequest,
  resetOperationsHealth,
  type OperationsHealthSources,
} from '../../src/services/operationsHealthService';

const now = new Date('2026-11-19T12:00:00.000Z');

const input = {
  supplier: {
    lastSuccessfulRequest: new Date('2026-11-19T11:58:00.000Z'),
    recentFailures: 0,
    recentRequests: 12,
  },
  payment: { circuitState: 'CLOSED' as const },
  contract: {
    available: true,
    lastReconciledAt: new Date('2026-11-19T11:55:00.000Z'),
    needsReviewCount: 0,
  },
};

describe('operations health snapshot', () => {
  beforeEach(() => resetOperationsHealth());

  it('maps healthy supplier, payment and contract state', () => {
    const snapshot = computeOperationsHealth(input, now);

    expect(snapshot.generatedAt).toBe(now.toISOString());
    expect(snapshot.supplier).toMatchObject({
      currentHealth: 'healthy',
      recentFailures: 0,
      recentRequestWindow: MAX_SUPPLIER_REQUESTS,
      lastSuccessfulRequest: '2026-11-19T11:58:00.000Z',
    });
    expect(snapshot.payment).toEqual({ currentHealth: 'healthy', circuitState: 'CLOSED' });
    expect(snapshot.contract).toMatchObject({
      currentHealth: 'healthy',
      needsReviewCount: 0,
      lastReconciledAt: '2026-11-19T11:55:00.000Z',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/secret|token|private[_-]?key/i);
  });

  it('reports unavailable instead of inventing state when there is no telemetry', () => {
    const snapshot = computeOperationsHealth({
      supplier: { lastSuccessfulRequest: null, recentFailures: 0, recentRequests: 0 },
      payment: { circuitState: 'unavailable' },
      contract: { available: false, lastReconciledAt: null, needsReviewCount: 0 },
    }, now);

    expect(snapshot.supplier.currentHealth).toBe('unavailable');
    expect(snapshot.supplier.lastSuccessfulRequest).toBeNull();
    expect(snapshot.payment.currentHealth).toBe('unavailable');
    expect(snapshot.contract.currentHealth).toBe('unavailable');
    expect(snapshot.contract.lastReconciledAt).toBeNull();
  });

  it('maps degraded and unhealthy states with bounded failure counts', () => {
    expect(computeOperationsHealth({ ...input, supplier: { ...input.supplier, recentFailures: 1 } }, now)
      .supplier.currentHealth).toBe('degraded');
    expect(computeOperationsHealth({ ...input, supplier: { ...input.supplier, recentFailures: 4 } }, now)
      .supplier.currentHealth).toBe('unhealthy');

    expect(computeOperationsHealth({ ...input, payment: { circuitState: 'HALF_OPEN' } }, now)
      .payment.currentHealth).toBe('degraded');
    expect(computeOperationsHealth({ ...input, payment: { circuitState: 'OPEN' } }, now)
      .payment.currentHealth).toBe('unhealthy');
    expect(computeOperationsHealth({ ...input, contract: { ...input.contract, needsReviewCount: 2 } }, now)
      .contract.currentHealth).toBe('degraded');
  });

  it('keeps only a bounded window of supplier outcomes', () => {
    for (let i = 0; i < MAX_SUPPLIER_REQUESTS + 10; i += 1) {
      recordSupplierRequest(false, now);
    }
    recordSupplierRequest(true, now);

    const data = getSupplierRequestData();
    expect(data.recentRequests).toBe(MAX_SUPPLIER_REQUESTS);
    expect(data.recentFailures).toBe(MAX_SUPPLIER_REQUESTS - 1);
    expect(data.lastSuccessfulRequest).toEqual(now);
    expect(computeOperationsHealth({ ...input, supplier: data }, now).supplier.recentFailures)
      .toBe(MAX_SUPPLIER_REQUESTS - 1);
  });

  it('caches the snapshot for the TTL and refreshes after it expires', async () => {
    let clock = 1_000;
    let calls = 0;
    const sources: OperationsHealthSources = {
      supplier: async () => { calls += 1; return input.supplier; },
      payment: async () => input.payment,
      contract: async () => input.contract,
    };

    const first = await getOperationsHealth(sources, () => clock);
    clock += OPERATIONS_HEALTH_TTL_MS - 1;
    const second = await getOperationsHealth(sources, () => clock);
    expect(second).toBe(first);
    expect(calls).toBe(1);

    clock += 2;
    await getOperationsHealth(sources, () => clock);
    expect(calls).toBe(2);
  });
});
