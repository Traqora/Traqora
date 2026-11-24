'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, getAuthHeader } from '@/lib/api';

interface OperationsBooking {
  bookingId: string;
  bookingReference: string | null;
  bookingState: string;
  supplierState: string;
  paymentReference: string | null;
  reconciliationStatus: string;
  reconciliationDetail: string | null;
  flightNumber: string;
  departureTime: string;
  amountCents: number;
  updatedAt: string;
}

interface OperationsResponse {
  success: boolean;
  data: OperationsBooking[];
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
        return;
      }
      if (!response.ok) {
        setLoadState('error');
        setRows([]);
        return;
      }

      const body = (await response.json()) as OperationsResponse;
      setRows(Array.isArray(body.data) ? body.data : []);
      setLoadState('ready');
    } catch {
      setLoadState('error');
      setRows([]);
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
          Authoritative booking, supplier, payment and reconciliation state. Values without recorded
          telemetry are shown as Unavailable.
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

      {loadState === 'ready' && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Booking operations summary</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b p-2 text-left">Booking</th>
                <th scope="col" className="border-b p-2 text-left">Booking state</th>
                <th scope="col" className="border-b p-2 text-left">Supplier state</th>
                <th scope="col" className="border-b p-2 text-left">Payment reference</th>
                <th scope="col" className="border-b p-2 text-left">Reconciliation</th>
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
                  <td className="border-b p-2">
                    <span>{displayState(row.reconciliationStatus)}</span>
                    {row.reconciliationDetail && (
                      <span className="block text-xs text-muted-foreground">
                        {row.reconciliationDetail}
                      </span>
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
