'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface FlightStatusAlert {
  id: string;
  userId: string;
  flightId: string;
  bookingId?: string;
  isActive: boolean;
  createdAt: string;
  lastNotifiedAt?: string;
  lastStatus?: string;
}

export function useFlightStatusAlerts() {
  const [alerts, setAlerts] = useState<FlightStatusAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/flight-status/alerts', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch flight status subscriptions');
      }

      const result = await response.json();
      setAlerts(result.data || []);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: 'Error',
        description: 'Failed to load flight status subscriptions.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const subscribe = useCallback(
    async (data: { flightId: string; bookingId?: string }) => {
      try {
        const response = await fetch('/api/v1/flight-status/alerts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            flightId: data.flightId,
            bookingId: data.bookingId,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to subscribe to flight status updates');
        }

        const result = await response.json();
        setAlerts((prev) => [result.data, ...prev]);
        return result.data;
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to subscribe to flight status updates',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast]
  );

  const unsubscribe = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/v1/flight-status/alerts/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to unsubscribe from flight status updates');
        }

        setAlerts((prev) => prev.filter((a) => a.id !== id));
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to unsubscribe from flight status updates',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast]
  );

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return {
    alerts,
    isLoading,
    error,
    fetchAlerts,
    subscribe,
    unsubscribe,
  };
}
