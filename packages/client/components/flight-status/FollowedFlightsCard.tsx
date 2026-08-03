'use client';

import { useEffect, useState } from 'react';
import { PlaneTakeoff, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFlightStatusAlerts } from '@/hooks/useFlightStatusAlerts';

interface OnTimePerformance {
  flightId: string;
  sampleSize: number;
  onTimeCount: number;
  disruptedCount: number;
  onTimeRate: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  on_time: 'On time',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  gate_changed: 'Gate changed',
  boarding: 'Boarding',
  departed: 'Departed',
};

const DISRUPTED_STATUSES = new Set(['delayed', 'cancelled']);

async function fetchOnTimePerformance(flightId: string): Promise<OnTimePerformance | null> {
  try {
    const res = await fetch(`/api/v1/flight-status/${encodeURIComponent(flightId)}/performance`);
    if (!res.ok) return null;
    const body = await res.json();
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * "Flight following" dashboard widget (issue #332): lists the flights the
 * user has an active real-time status subscription for (see
 * useFlightStatusAlerts, wired to the flight_status WebSocket event in
 * issue #333), each with its live status and historical on-time rate.
 */
export function FollowedFlightsCard() {
  const { alerts, isLoading, unsubscribe } = useFlightStatusAlerts();
  const [performance, setPerformance] = useState<Record<string, OnTimePerformance>>({});

  useEffect(() => {
    let cancelled = false;

    Promise.all(alerts.map((alert) => fetchOnTimePerformance(alert.flightId))).then((results) => {
      if (cancelled) return;
      setPerformance((prev) => {
        const next = { ...prev };
        results.forEach((perf, i) => {
          if (perf) next[alerts[i].flightId] = perf;
        });
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts.map((a) => a.flightId).join(',')]);

  if (isLoading) {
    return null;
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PlaneTakeoff className="h-5 w-5" />
            Followed Flights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You&apos;re not following any flights yet. Subscribe to a flight from its status page to get
            real-time delay and gate-change alerts here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <PlaneTakeoff className="h-5 w-5" />
          Followed Flights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => {
          const perf = performance[alert.flightId];
          const status = alert.lastStatus;
          const disrupted = status ? DISRUPTED_STATUSES.has(status) : false;

          return (
            <div
              key={alert.id}
              className="flex items-center justify-between rounded-md border border-border p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{alert.flightId}</span>
                  {status && (
                    <Badge variant={disrupted ? 'destructive' : 'secondary'}>
                      {STATUS_LABELS[status] ?? status}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {perf && perf.sampleSize > 0
                    ? `On-time ${Math.round((perf.onTimeRate ?? 0) * 100)}% (${perf.sampleSize} recorded change${perf.sampleSize === 1 ? '' : 's'})`
                    : 'No on-time performance history yet'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Stop following flight ${alert.flightId}`}
                onClick={() => unsubscribe(alert.id).catch(() => undefined)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
