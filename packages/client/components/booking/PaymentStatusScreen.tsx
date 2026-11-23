import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed';

interface PaymentStatusScreenProps {
  bookingId: string;
  initialStatus?: PaymentStatus;
  txHash?: string;
  errorMessage?: string;
  onRetry?: () => Promise<void> | void;
  onViewBooking?: () => void;
}

export const PaymentStatusScreen: React.FC<PaymentStatusScreenProps> = ({
  bookingId,
  initialStatus = 'pending',
  txHash,
  errorMessage,
  onRetry,
  onViewBooking,
}) => {
  const [status, setStatus] = useState<PaymentStatus>(initialStatus);
  const [isRetrying, setIsRetrying] = useState(false);
  const [error, setError] = useState<string | null>(errorMessage || null);

  const handleRetryAction = async () => {
    setIsRetrying(true);
    setError(null);
    setStatus('processing');
    try {
      if (onRetry) {
        await onRetry();
      } else {
        // Default retry simulation
        await new Promise((res) => setTimeout(res, 2000));
      }
      setStatus('success');
      toast.success('Payment settled successfully');
    } catch (err: any) {
      const msg = err?.message || 'Transaction submission failed. Please try again.';
      setError(msg);
      setStatus('failed');
      toast.error('Payment retry failed', { description: msg });
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="flex justify-center items-center p-4 min-h-[400px]">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            {status === 'success' && <CheckCircle2 className="h-12 w-12 text-green-600" />}
            {status === 'failed' && <XCircle className="h-12 w-12 text-destructive" />}
            {(status === 'pending' || status === 'processing') && (
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            )}
          </div>
          <CardTitle>
            {status === 'success' && 'Payment Successful'}
            {status === 'failed' && 'Payment Failed'}
            {status === 'processing' && 'Processing Payment'}
            {status === 'pending' && 'Awaiting Settlement'}
          </CardTitle>
          <CardDescription>
            Booking ID: <span className="font-mono font-medium">{bookingId}</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'success' && (
            <Alert className="bg-green-50 border-green-200 text-green-800">
              <AlertTitle>Settled on Stellar</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Your flight booking has been confirmed via smart contract settlement.</p>
                {txHash && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-mono underline text-green-900 mt-1"
                  >
                    View Transaction <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </AlertDescription>
            </Alert>
          )}

          {status === 'failed' && (
            <Alert variant="destructive">
              <AlertTitle>Transaction Unsuccessful</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>{error || 'The Soroban transaction could not be completed.'}</p>
                <div className="mt-2 text-xs bg-destructive/10 p-2 rounded">
                  <span className="font-semibold">Retry Guidance:</span> Check wallet balance for sufficient XLM/gas fees, verify network connectivity, and submit again.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {(status === 'pending' || status === 'processing') && (
            <div className="text-center text-sm text-muted-foreground py-4">
              Please approve the transaction prompt in your wallet and wait for network confirmation.
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          {status === 'failed' && (
            <Button
              className="w-full gap-2"
              onClick={handleRetryAction}
              disabled={isRetrying}
              aria-label="Retry payment transaction"
            >
              {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Retry Payment
            </Button>
          )}

          {status === 'success' && onViewBooking && (
            <Button className="w-full" onClick={onViewBooking} aria-label="View booking details">
              View Itinerary
            </Button>
          )}

          {status === 'pending' && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleRetryAction}
              disabled={isRetrying}
            >
              <RefreshCw className="h-4 w-4" /> Check Status
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};
export default PaymentStatusScreen;
