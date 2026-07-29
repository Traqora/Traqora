'use client';

import { useState, useCallback } from 'react';

interface InsuranceQuote {
  coverageType: 'basic' | 'standard' | 'premium';
  premiumCents: number;
  currency: string;
  coverageDetails: {
    medicalExpenses: string;
    tripCancellation: string;
    baggageLoss: string;
    flightDelay: string;
  };
}

interface InsurancePolicy {
  id: string;
  bookingId: string;
  tripCostCents: number;
  coverageType: string;
  premiumCents: number;
  currency: string;
  providerPolicyRef: string;
  status: string;
  purchasedAt: string;
  expiresAt: string;
}

export function useInsurance() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getQuotes = useCallback(async (tripCostCents: number, destination: string): Promise<InsuranceQuote[]> => {
    try {
      setLoading(true);
      setError(null);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(
        `${apiUrl}/api/v1/insurance/quotes?tripCostCents=${tripCostCents}&destination=${destination}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch quotes');
      }

      const result = await response.json();
      return result.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quotes');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const purchasePolicy = useCallback(async (
    bookingId: string,
    tripCostCents: number,
    destination: string,
    coverageType: 'basic' | 'standard' | 'premium'
  ): Promise<InsurancePolicy | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/v1/insurance/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bookingId,
          tripCostCents,
          destination,
          coverageType,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to purchase policy');
      }

      const result = await response.json();
      return result.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to purchase policy');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPolicy = useCallback(async (policyId: string): Promise<InsurancePolicy | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/v1/insurance/policy/${policyId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch policy');
      }

      const result = await response.json();
      return result.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load policy');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const getPolicyByBooking = useCallback(async (bookingId: string): Promise<InsurancePolicy | null> => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/v1/insurance/booking/${bookingId}`);

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.data;
    } catch {
      return null;
    }
  }, []);

  const downloadPolicyPdf = useCallback(async (policyId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/v1/insurance/policy/${policyId}/pdf`);

      if (!response.ok) {
        throw new Error('Failed to download policy');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `policy-${policyId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download policy');
    }
  }, []);

  return {
    loading,
    error,
    getQuotes,
    purchasePolicy,
    getPolicy,
    getPolicyByBooking,
    downloadPolicyPdf,
  };
}
