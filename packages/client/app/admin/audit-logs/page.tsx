'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  apiClient,
  type AuditLogEntry,
  type AuditLogFilters,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface FormFilters {
  from: string;
  to: string;
  reference: string;
  resource: string;
  action: string;
  actorType: string;
}

const EMPTY_FILTERS: FormFilters = {
  from: '',
  to: '',
  reference: '',
  resource: '',
  action: '',
  actorType: '',
};

const ACTOR_TYPES = [
  ['', 'All actors'],
  ['user', 'Traveler'],
  ['admin', 'Admin'],
  ['system', 'System'],
] as const;

function toIso(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toApiFilters(filters: FormFilters): AuditLogFilters {
  return {
    from: toIso(filters.from),
    to: toIso(filters.to),
    resourceId: filters.reference.trim() || undefined,
    resource: filters.resource.trim() || undefined,
    action: filters.action.trim() || undefined,
    actorType: (filters.actorType || undefined) as AuditLogFilters['actorType'],
    page: 1,
    limit: 50,
  };
}

export default function AuditLogsPage() {
  const [form, setForm] = useState<FormFilters>(EMPTY_FILTERS);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async (filters: FormFilters) => {
    setLoadState('loading');
    const result = await apiClient.getAuditLogs(toApiFilters(filters));
    if (!result.success) {
      setLoadState('error');
      setLogs([]);
      setTotal(0);
      return;
    }
    setLogs(result.data.data);
    setTotal(result.data.pagination.total);
    setLoadState('ready');
  }, []);

  useEffect(() => {
    void load(EMPTY_FILTERS);
  }, [load]);

  const update = (key: keyof FormFilters, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    void load(form);
  };

  const clearFilters = () => {
    setForm(EMPTY_FILTERS);
    void load(EMPTY_FILTERS);
  };

  const downloadCsv = async () => {
    setExporting(true);
    try {
      const result = await apiClient.exportAuditLogs(toApiFilters(form));
      if (!result.success) return;
      const url = URL.createObjectURL(new Blob([result.data], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'audit-log.csv';
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <main className="container mx-auto p-8 space-y-6" aria-labelledby="audit-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="audit-heading" className="text-2xl font-semibold">Security audit logs</h1>
          <p className="text-sm text-muted-foreground">
            Filter security and booking lifecycle events by time and reference. Values are matched exactly.
          </p>
        </div>
        <Button variant="outline" onClick={() => void downloadCsv()} disabled={exporting}>
          {exporting ? 'Preparing export...' : 'Export CSV'}
        </Button>
      </div>

      <form className="grid grid-cols-1 gap-4 md:grid-cols-3" onSubmit={applyFilters}>
        <div className="space-y-2">
          <Label htmlFor="audit-from">From</Label>
          <Input
            id="audit-from"
            type="datetime-local"
            value={form.from}
            onChange={(event) => update('from', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-to">To</Label>
          <Input
            id="audit-to"
            type="datetime-local"
            value={form.to}
            onChange={(event) => update('to', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-reference">Booking reference</Label>
          <Input
            id="audit-reference"
            placeholder="TQ-ABC123"
            value={form.reference}
            onChange={(event) => update('reference', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-resource">Resource</Label>
          <Input
            id="audit-resource"
            placeholder="bookings"
            value={form.resource}
            onChange={(event) => update('resource', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-action">Action</Label>
          <Input
            id="audit-action"
            placeholder="support_booking_access"
            value={form.action}
            onChange={(event) => update('action', event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="audit-actor">Actor type</Label>
          <select
            id="audit-actor"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={form.actorType}
            onChange={(event) => update('actorType', event.target.value)}
          >
            {ACTOR_TYPES.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply filters</Button>
          <Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button>
        </div>
      </form>

      <div aria-live="polite">
        {loadState === 'loading' && <p>Loading audit logs...</p>}
        {loadState === 'error' && (
          <div role="alert" className="space-y-2">
            <p>Unable to load audit logs.</p>
            <Button variant="outline" onClick={() => void load(form)}>Retry</Button>
          </div>
        )}
        {loadState === 'ready' && <p>{total} matching events</p>}
      </div>

      {loadState === 'ready' && logs.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <caption className="sr-only">Security and booking lifecycle audit events</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Time</TableHead>
                <TableHead scope="col">Action</TableHead>
                <TableHead scope="col">Actor</TableHead>
                <TableHead scope="col">Resource</TableHead>
                <TableHead scope="col">Reference</TableHead>
                <TableHead scope="col">IP address</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{log.action.replaceAll('_', ' ')}</TableCell>
                  <TableCell>{log.adminId ?? log.userId ?? log.actorType}</TableCell>
                  <TableCell>{log.resource ?? '-'}</TableCell>
                  <TableCell>{log.resourceId ?? '-'}</TableCell>
                  <TableCell className="font-mono text-sm">{log.ipAddress}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
