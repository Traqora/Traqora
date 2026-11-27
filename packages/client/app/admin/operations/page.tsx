'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeader } from '@/lib/api';

interface BookingMismatch {
  type: string;
  severity: string;
  detail: string;
}

interface OperationsBooking {
  bookingId: string;
  bookingReference: string | null;
  bookingState: string;
  supplierState: string;
  paymentReference: string | null;
  contractState: string;
  reconciliationStatus: string;
  reconciliationDetail: string | null;
  mismatches: BookingMismatch[];
  flightNumber: string;
  departureTime: string;
  amountCents: number;
  updatedAt: string;
}

interface ReconciliationSummary {
  scannedBookings: number;
  mismatchedBookings: number;
  mismatchCount: number;
  byType: Record<string, number>;
  bySeverity: { high: number; medium: number; low: number };
}

interface OperationsResponse {
  success: boolean;
  data: OperationsBooking[];
  summary?: ReconciliationSummary;
  pagination?: { total: number };
}

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error';

const STATUS_OPTIONS = [
  ['', 'All states'],
  ['confirmed', 'Confirmed'],
  ['paid', 'Paid'],
  ['onchain_submitted', 'Submitted on-chain'],
  ['failed', 'Failed'],
] as const;

function displayValue(value: string | null | undefined): string {
  if (!value || value === 'unavailable') return 'Unavailable';
  return value;
}

function displayState(value: string | null | undefined): string {
  if (!value || value === 'unavailable') return 'Unavailable';
  return value.toLowerCase().replaceAll('_', ' ');
}

export default function OperationsPage() {
  const [rows, setRows] = useState<OperationsBooking[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [status, setStatus] = useState('');
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const load = useCallback(async (nextStatus: string) => {
    setLoadState('loading');
    try {
      const query = nextStatus ? `?status=${encodeURIComponent(nextStatus)}` : '';
      const response = await fetch(`${API_BASE_URL}/api/v1/admin/operations/bookings${query}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });

      if (response.status === 403) {
        setLoadState('forbidden');
        setRows([]);
        setSummary(null);
        return;
      }
      if (!response.ok) {
        setLoadState('error');
        setRows([]);
        setSummary(null);
        return;
      }

      const body = (await response.json()) as OperationsResponse;
      setRows(Array.isArray(body.data) ? body.data : []);
      setSummary(body.summary ?? null);
      setLoadState('ready');
    } catch {
      setLoadState('error');
      setRows([]);
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  return (
    <main className="container mx-auto space-y-6 p-6" aria-labelledby="operations-heading">
      <div>
        <h1 id="operations-heading" className="text-2xl font-semibold">Booking operations</h1>
        <p className="text-sm text-muted-foreground">
          Authoritative booking, supplier, payment, contract and reconciliation state, including
          detected mismatches. Values without recorded telemetry are shown as Unavailable.
        </p>
      </div>

      <div className="flex items-end gap-3">
        <label htmlFor="operations-status" className="text-sm font-medium">
          Booking state
        </label>
        <select
          id="operations-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          {STATUS_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div aria-live="polite">
        {loadState === 'loading' && <p>Loading operations data...</p>}
        {loadState === 'forbidden' && (
          <p role="alert">You do not have permission to view operations data.</p>
        )}
        {loadState === 'error' && (
          <div role="alert" className="space-y-2">
            <p>Unable to load operations data.</p>
            <button
              type="button"
              onClick={() => void load(status)}
              className="rounded-md border px-3 py-2 text-sm"
            >
              Retry
            </button>
          </div>
        )}
        {loadState === 'ready' && rows.length === 0 && <p>No bookings to display.</p>}
      </div>

      {loadState === 'ready' && summary && (
        <section
          aria-labelledby="reconciliation-summary-heading"
          className="rounded-md border p-4"
        >
          <h2 id="reconciliation-summary-heading" className="text-lg font-semibold">
            Reconciliation summary
          </h2>
          <p className="text-sm text-muted-foreground">
            Counts cover the current page of bookings.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Bookings scanned</dt>
              <dd className="text-lg font-semibold">{summary.scannedBookings}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mismatched bookings</dt>
              <dd className="text-lg font-semibold">{summary.mismatchedBookings}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mismatches</dt>
              <dd className="text-lg font-semibold">{summary.mismatchCount}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">High severity</dt>
              <dd className="text-lg font-semibold">{summary.bySeverity?.high ?? 0}</dd>
            </div>
          </dl>
        </section>
      )}

      {loadState === 'ready' && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Booking operations and reconciliation summary</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b p-2 text-left">Booking</th>
                <th scope="col" className="border-b p-2 text-left">Booking state</th>
                <th scope="col" className="border-b p-2 text-left">Supplier state</th>
                <th scope="col" className="border-b p-2 text-left">Payment reference</th>
                <th scope="col" className="border-b p-2 text-left">Contract state</th>
                <th scope="col" className="border-b p-2 text-left">Reconciliation</th>
                <th scope="col" className="border-b p-2 text-left">Mismatches</th>
                <th scope="col" className="border-b p-2 text-left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.bookingId}>
                  <td className="border-b p-2">
                    <span>{displayValue(row.bookingReference ?? row.bookingId)}</span>
                    <span className="block text-xs text-muted-foreground">{displayValue(row.flightNumber)}</span>
                  </td>
                  <td className="border-b p-2">{displayState(row.bookingState)}</td>
                  <td className="border-b p-2">{displayState(row.supplierState)}</td>
                  <td className="border-b p-2">{displayValue(row.paymentReference)}</td>
                  <td className="border-b p-2">{displayState(row.contractState)}</td>
                  <td className="border-b p-2">
                    <span>{displayState(row.reconciliationStatus)}</span>
                    {row.reconciliationDetail && (
                      <span className="block text-xs text-muted-foreground">
                        {row.reconciliationDetail}
                      </span>
                    )}
                  </td>
                  <td className="border-b p-2">
                    {row.mismatches?.length ? (
                      <ul className="space-y-1" aria-label="Reconciliation mismatches">
                        {row.mismatches.map((mismatch) => (
                          <li key={`${mismatch.type}-${mismatch.detail}`}>
                            <span className="font-medium">{displayState(mismatch.type)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {displayState(mismatch.severity)}: {mismatch.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      'None'
                    )}
                  </td>
                  <td className="border-b p-2">{displayValue(row.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
