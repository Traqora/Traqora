'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeader } from '@/lib/api';

type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unavailable';

interface OperationsHealth {
  generatedAt: string;
  supplier: {
    lastSuccessfulRequest: string | null;
    currentHealth: HealthState;
    recentFailures: number;
    recentRequestWindow: number;
  };
  payment: { currentHealth: HealthState; circuitState: string };
  contract: {
    currentHealth: HealthState;
    lastReconciledAt: string | null;
    needsReviewCount: number;
  };
}

function formatTime(value: string | null): string {
  if (!value) return 'No recorded value';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No recorded value' : date.toLocaleString();
}

function StateBadge({ state }: { state: HealthState }) {
  return (
    <span data-testid="health-state" data-state={state} className="rounded border px-2 py-1 text-xs">
      {state}
    </span>
  );
}

export default function OperationsHealthPage() {
  const [health, setHealth] = useState<OperationsHealth | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'forbidden' | 'error'>('loading');

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const response = await fetch(`${API_BASE_URL}/health/operations`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });
      if (response.status === 401 || response.status === 403) {
        setLoadState('forbidden');
        return;
      }
      if (!response.ok) {
        setLoadState('error');
        return;
      }
      setHealth((await response.json()) as OperationsHealth);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="container mx-auto space-y-6 p-6" aria-labelledby="health-heading">
      <div>
        <h1 id="health-heading" className="text-2xl font-semibold">Operations health</h1>
        <p className="text-sm text-muted-foreground">
          Supplier, payment and contract state. Only statuses and counters are shown, never keys or signing material.
        </p>
      </div>

      <div aria-live="polite">
        {loadState === 'loading' && <p>Loading health snapshot...</p>}
        {loadState === 'forbidden' && (
          <p role="alert">You do not have permission to view operations health.</p>
        )}
        {loadState === 'error' && (
          <div role="alert" className="space-y-2">
            <p>Unable to load operations health.</p>
            <button type="button" onClick={() => void load()} className="rounded border px-3 py-2 text-sm">
              Retry
            </button>
          </div>
        )}
      </div>

      {loadState === 'ready' && health && (
        <>
          <section aria-labelledby="supplier-health-heading" className="rounded border p-4">
            <h2 id="supplier-health-heading" className="text-lg font-medium">Supplier health</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <dt className="font-medium">Current health</dt>
              <dd><StateBadge state={health.supplier.currentHealth} /></dd>
              <dt className="font-medium">Last successful request</dt>
              <dd>{formatTime(health.supplier.lastSuccessfulRequest)}</dd>
              <dt className="font-medium">Recent failures</dt>
              <dd>
                {health.supplier.recentFailures} of {health.supplier.recentRequestWindow} recent requests
              </dd>
            </dl>
          </section>

          <section aria-labelledby="payment-health-heading" className="rounded border p-4">
            <h2 id="payment-health-heading" className="text-lg font-medium">Payment health</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <dt className="font-medium">Current health</dt>
              <dd><StateBadge state={health.payment.currentHealth} /></dd>
              <dt className="font-medium">Circuit state</dt>
              <dd>{health.payment.circuitState}</dd>
            </dl>
          </section>

          <section aria-labelledby="contract-health-heading" className="rounded border p-4">
            <h2 id="contract-health-heading" className="text-lg font-medium">Contract and reconciliation health</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <dt className="font-medium">Current health</dt>
              <dd><StateBadge state={health.contract.currentHealth} /></dd>
              <dt className="font-medium">Last reconciliation</dt>
              <dd>{formatTime(health.contract.lastReconciledAt)}</dd>
              <dt className="font-medium">Needs review</dt>
              <dd>{health.contract.needsReviewCount} events in the last 24 hours</dd>
            </dl>
          </section>

          <p className="text-xs text-muted-foreground">
            Snapshot generated {formatTime(health.generatedAt)}.
          </p>
        </>
      )}
    </main>
  );
}
