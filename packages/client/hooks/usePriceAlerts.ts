'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface PriceAlert {
  id: string;
  userId: string;
  flightId: string;
  targetPrice: number;
  currentPrice?: number;
  currency: string;
  notificationMethod: 'email' | 'push' | 'both';
  isActive: boolean;
  createdAt: string;
  lastNotifiedAt?: string;
  triggeredCount: number;
}

export function usePriceAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/alerts', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch alerts');
      }

      const result = await response.json();
      setAlerts(result.data || []);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: 'Error',
        description: 'Failed to load price alerts.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const createAlert = useCallback(
    async (data: {
      flightId: string;
      targetPrice: number;
      currency?: string;
      notificationMethod?: 'email' | 'push' | 'both';
    }) => {
      try {
        const response = await fetch('/api/v1/alerts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            flightId: data.flightId,
            targetPrice: data.targetPrice,
            currency: data.currency || 'USD',
            notificationMethod: data.notificationMethod || 'email',
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create alert');
        }

        const result = await response.json();
        setAlerts((prev) => [result.data, ...prev]);
        return result.data;
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to create alert',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast]
  );

  const updateAlert = useCallback(
    async (id: string, data: Partial<PriceAlert>) => {
      try {
        const response = await fetch(`/api/v1/alerts/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          throw new Error('Failed to update alert');
        }

        const result = await response.json();
        setAlerts((prev) => prev.map((a) => (a.id === id ? result.data : a)));
        return result.data;
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to update alert',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast]
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/v1/alerts/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to delete alert');
        }

        setAlerts((prev) => prev.filter((a) => a.id !== id));
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to delete alert',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast]
  );

  const reactivateAlert = useCallback(
    async (id: string) => {
      try {
        const response = await fetch(`/api/v1/alerts/${id}/activate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to reactivate alert');
        }

        const result = await response.json();
        setAlerts((prev) => prev.map((a) => (a.id === id ? result.data : a)));
        return result.data;
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to reactivate alert',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [toast]
  );

  const checkPrice = useCallback(
    async (flightId: string) => {
      try {
        const response = await fetch('/api/v1/alerts/check', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ flightId }),
        });

        if (!response.ok) {
          throw new Error('Failed to check price');
        }

        const result = await response.json();
        return result.data;
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to check price',
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
    createAlert,
    updateAlert,
    deleteAlert,
    reactivateAlert,
    checkPrice,
  };
}