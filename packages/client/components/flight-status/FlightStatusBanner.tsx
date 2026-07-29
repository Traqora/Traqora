'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useSocketEvents, type FlightAlertEvent } from '@/hooks/use-socket-events';

/**
 * Surfaces real-time flight status changes (delays, cancellations, gate
 * changes) delivered over the `alert` socket event (#380). Shows the most
 * recent alerts as a dismissible list; SocketProvider already raises a toast
 * for each one globally, so this banner is for anyone landing on a page
 * after the toast has already disappeared.
 */
export function FlightStatusBanner() {
  const [activeAlerts, setActiveAlerts] = useState<(FlightAlertEvent & { id: string })[]>([]);

  useSocketEvents({
    onFlightAlert: (data) => {
      setActiveAlerts((prev) => [
        { ...data, id: `${data.flightId}-${Date.now()}` },
        ...prev,
      ].slice(0, 5));
    },
  });

  const dismiss = (id: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (activeAlerts.length === 0) return null;

  return (
    <div className="space-y-2" role="region" aria-label="Flight status alerts">
      {activeAlerts.map((alert) => (
        <Alert key={alert.id} variant="destructive" className="relative">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="pr-8">{alert.message}</AlertDescription>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-2 top-2 h-6 w-6 p-0"
            onClick={() => dismiss(alert.id)}
            aria-label="Dismiss alert"
          >
            <X className="h-3 w-3" />
          </Button>
        </Alert>
      ))}
    </div>
  );
}
