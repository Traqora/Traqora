"use client"

import { useEffect } from 'react';
import { useTransactionStatus } from '@/hooks/use-transaction-status';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { getStellarExpertUrl } from '@/lib/wallet';

interface TransactionStatusTrackerProps {
  bookingId: string;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  network?: 'testnet' | 'mainnet';
}

export function TransactionStatusTracker({
  bookingId,
  onSuccess,
  onError,
  network = 'testnet',
}: TransactionStatusTrackerProps) {
  const { status, isPolling, error } = useTransactionStatus({
    bookingId,
    enabled: true,
    pollingInterval: 3000,
    maxAttempts: 60,
    onSuccess: () => onSuccess?.(),
    onError: (err) => onError?.(err),
  });

  const txStatus = status?.transactionStatus;
  const txHash = txStatus?.txHash;

  useEffect(() => {
    if (txStatus?.status === 'success') {
      onSuccess?.();
    } else if (txStatus?.status === 'failed') {
      onError?.(txStatus.error || 'Transaction failed');
    }
  }, [txStatus?.status, txStatus?.error, onSuccess, onError]);

  const getStatusIcon = () => {
    if (!txStatus) {
      return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }

    switch (txStatus.status) {
      case 'success':
        return <CheckCircle className="h-6 w-6 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-6 w-6 text-destructive" />;
      case 'pending':
        return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
      case 'not_found':
        return <Clock className="h-6 w-6 text-muted-foreground" />;
      default:
        return <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />;
    }
  };

  const getStatusMessage = () => {
    if (!txStatus) {
      return 'Initializing transaction...';
    }

    switch (txStatus.status) {
      case 'success':
        return 'Transaction confirmed on blockchain!';
      case 'failed':
        return txStatus.error || 'Transaction failed';
      case 'pending':
        return 'Waiting for blockchain confirmation...';
      case 'not_found':
        return 'Transaction submitted, waiting for network...';
      default:
        return 'Processing transaction...';
    }
  };

  const getProgressValue = () => {
    if (!txStatus) return 10;
    
    switch (txStatus.status) {
      case 'success':
        return 100;
      case 'failed':
        return 100;
      case 'pending':
        return 60;
      case 'not_found':
        return 30;
      default:
        return 10;
    }
  };

  if (error && !txStatus) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-2">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Status Header */}
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div className="flex-1">
              <p className="font-medium">{getStatusMessage()}</p>
              {txHash && (
                <p className="text-sm text-muted-foreground font-mono">
                  {txHash.slice(0, 12)}...{txHash.slice(-8)}
                </p>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          {isPolling && txStatus?.status !== 'success' && txStatus?.status !== 'failed' && (
            <div className="space-y-2">
              <Progress value={getProgressValue()} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                Checking transaction status...
              </p>
            </div>
          )}

          {/* Transaction Link */}
          {txHash && !txHash.startsWith('0x') && (
            <a
              href={getStellarExpertUrl(txHash, network)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View on Stellar Expert
              <svg
                className="h-3 w-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}

          {/* Success Message */}
          {txStatus?.status === 'success' && (
            <Alert className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertDescription className="text-green-800 dark:text-green-200">
                Your booking has been confirmed and recorded on the Stellar blockchain. 
                This transaction is now immutable and verifiable.
              </AlertDescription>
            </Alert>
          )}

          {/* Error Message */}
          {txStatus?.status === 'failed' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {txStatus.error || 'Transaction failed. Please try again or contact support.'}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
