'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface Review {
  id: string;
  airlineCode: string;
  rating: number;
  title?: string;
  content?: string;
  pros?: string[];
  cons?: string[];
  isVerified: boolean;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  user: {
    walletAddress: string;
  };
  booking: {
    id: string;
    flight: {
      from: string;
      to: string;
      airline: string;
    };
  };
}

export interface AirlineStats {
  airlineCode: string;
  averageRating: number;
  totalReviews: number;
  ratingDistribution: Record<number, number>;
  verifiedReviews: number;
  unverifiedReviews: number;
}

interface UseAirlineReviewsOptions {
  airlineCode: string;
  userId?: string;
  bookingId?: string;
  autoFetch?: boolean;
}

export function useAirlineReviews({
  airlineCode,
  userId,
  bookingId,
  autoFetch = true,
}: UseAirlineReviewsOptions) {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<AirlineStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canReview, setCanReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState<number | null>(null);

  const fetchReviews = useCallback(async () => {
    if (!airlineCode) return;

    setIsLoading(true);
    setError(null);
    try {
      const url = `/api/v1/reviews?airlineCode=${airlineCode}${filterRating ? `&rating=${filterRating}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch reviews');
      }

      const result = await response.json();
      setReviews(result.data || []);
    } catch (err: any) {
      setError(err.message);
      toast({
        title: 'Error',
        description: 'Failed to load reviews. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [airlineCode, filterRating, toast]);

  const fetchStats = useCallback(async () => {
    if (!airlineCode) return;

    try {
      const response = await fetch(`/api/v1/reviews/airline/${airlineCode}/stats`);

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const result = await response.json();
      setStats(result.data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [airlineCode]);

  const checkCanReview = useCallback(async () => {
    if (!userId || !bookingId || !airlineCode) return;

    try {
      const response = await fetch(
        `/api/v1/reviews/airline/${airlineCode}/can-review?bookingId=${bookingId}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check review eligibility');
      }

      const result = await response.json();
      setCanReview(result.data.canReview);
    } catch (err) {
      console.error('Failed to check review eligibility:', err);
    }
  }, [airlineCode, userId, bookingId]);

  const createReview = useCallback(
    async (data: {
      rating: number;
      title?: string;
      content?: string;
      pros?: string[];
      cons?: string[];
    }) => {
      if (!airlineCode || !bookingId) {
        throw new Error('Missing required fields');
      }

      setIsSubmitting(true);
      try {
        const response = await fetch('/api/v1/reviews', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            airlineCode,
            bookingId,
            rating: data.rating,
            title: data.title,
            content: data.content,
            pros: data.pros?.filter((p) => p.trim()),
            cons: data.cons?.filter((c) => c.trim()),
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Failed to submit review');
        }

        const result = await response.json();

        toast({
          title: 'Review submitted!',
          description: 'Thank you for your feedback.',
        });

        setCanReview(false);
        await fetchReviews();
        await fetchStats();

        return result.data;
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to submit review',
          variant: 'destructive',
        });
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [airlineCode, bookingId, fetchReviews, fetchStats, toast]
  );

  const deleteReview = useCallback(
    async (reviewId: string) => {
      try {
        const response = await fetch(`/api/v1/reviews/${reviewId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to delete review');
        }

        toast({
          title: 'Review deleted',
          description: 'Your review has been removed.',
        });

        await fetchReviews();
        await fetchStats();
      } catch (err: any) {
        toast({
          title: 'Error',
          description: err.message || 'Failed to delete review',
          variant: 'destructive',
        });
        throw err;
      }
    },
    [fetchReviews, fetchStats, toast]
  );

  useEffect(() => {
    if (autoFetch && airlineCode) {
      fetchReviews();
      fetchStats();
      if (userId && bookingId) {
        checkCanReview();
      }
    }
  }, [autoFetch, airlineCode, fetchReviews, fetchStats, userId, bookingId, checkCanReview]);

  return {
    reviews,
    stats,
    isLoading,
    isSubmitting,
    canReview,
    error,
    filterRating,
    setFilterRating,
    fetchReviews,
    fetchStats,
    checkCanReview,
    createReview,
    deleteReview,
  };
}