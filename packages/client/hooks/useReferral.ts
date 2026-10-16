'use client';

import { useState, useEffect, useCallback } from 'react';

interface ReferralStats {
  totalClicks: number;
  totalConversions: number;
  pendingPoints: number;
  earnedPoints: number;
  referees: string[];
}

interface ReferralData {
  userId: string;
  referralCode: string | null;
  stats: ReferralStats;
  tier: string;
}

export function useReferral() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReferralData = useCallback(async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${apiUrl}/api/v1/referrals/dashboard`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch referral data');
      }

      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load referral data');
    } finally {
      setLoading(false);
    }
  }, []);

  const generateCode = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${apiUrl}/api/v1/referrals/codes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate code');
      }

      await fetchReferralData();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code');
      return false;
    }
  }, [fetchReferralData]);

  const sendInvite = useCallback(async (email: string, inviterName?: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('authToken');
      
      const response = await fetch(`${apiUrl}/api/v1/referrals/invite`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, inviterName }),
      });

      if (!response.ok) {
        throw new Error('Failed to send invite');
      }

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
      return false;
    }
  }, []);

  useEffect(() => {
    fetchReferralData();
  }, [fetchReferralData]);

  return {
    data,
    loading,
    error,
    generateCode,
    sendInvite,
    refresh: fetchReferralData,
  };
}
