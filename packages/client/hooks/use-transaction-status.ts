import { useEffect, useState, useCallback, useRef } from 'react';
import { apiClient, TransactionStatus } from '@/lib/api';
import { toast } from 'sonner';

interface UseTransactionStatusOptions {
  bookingId: string | null;
  enabled?: boolean;
  pollingInterval?: number;
  maxAttempts?: number;
  onSuccess?: (status: TransactionStatus) => void;
  onError?: (error: string) => void;
}

interface UseTransactionStatusResult {
  status: TransactionStatus | null;
  isPolling: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  stopPolling: () => void;
}

export const useTransactionStatus = ({
  bookingId,
  enabled = true,
  pollingInterval = 3000,
  maxAttempts = 60,
  onSuccess,
  onError,
}: UseTransactionStatusOptions): UseTransactionStatusResult => {
  const [status, setStatus] = useState<TransactionStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attemptCountRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!bookingId) return;

    try {
      const response = await apiClient.getTransactionStatus(bookingId);

      if (response.success && response.data) {
        setStatus(response.data);
        setError(null);

        const txStatus = response.data.transactionStatus;

        if (txStatus?.status === 'success') {
          stopPolling();
          onSuccess?.(response.data);
          toast.success('Transaction confirmed!', {
            description: 'Your booking has been recorded on the blockchain',
          });
        } else if (txStatus?.status === 'failed') {
          stopPolling();
          const errorMsg = txStatus.error || 'Transaction failed';
          setError(errorMsg);
          onError?.(errorMsg);
          toast.error('Transaction failed', {
            description: errorMsg,
          });
        } else if (attemptCountRef.current >= maxAttempts) {
          stopPolling();
          const timeoutMsg = 'Transaction status check timed out';
          setError(timeoutMsg);
          onError?.(timeoutMsg);
          toast.warning('Status check timed out', {
            description: 'Please check your booking status manually',
          });
        }

        attemptCountRef.current += 1;
      } else {
        const errorMsg = response.error?.message || 'Failed to fetch status';
        setError(errorMsg);
        
        if (attemptCountRef.current >= maxAttempts) {
          stopPolling();
          onError?.(errorMsg);
        }
      }
    } catch (err: any) {
      const errorMsg = err.message || 'Network error';
      setError(errorMsg);
      
      if (attemptCountRef.current >= maxAttempts) {
        stopPolling();
        onError?.(errorMsg);
      }
    }
  }, [bookingId, maxAttempts, onSuccess, onError, stopPolling]);

  const refetch = useCallback(async () => {
    attemptCountRef.current = 0;
    await fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!enabled || !bookingId) {
      stopPolling();
      return;
    }

    setIsPolling(true);
    attemptCountRef.current = 0;

    // Initial fetch
    fetchStatus();

    // Start polling
    intervalRef.current = setInterval(fetchStatus, pollingInterval);

    return () => {
      stopPolling();
    };
  }, [bookingId, enabled, pollingInterval, fetchStatus, stopPolling]);

  return {
    status,
    isPolling,
    error,
    refetch,
    stopPolling,
  };
};
