"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react"
import { PaymentRetryInput, PaymentRetryOutput, PaymentRetryError } from "@/client/types/payment"

interface PaymentRetryProps {
  bookingId: string;
  walletAddress?: string;
  onRetrySuccess?: (result: PaymentRetryOutput) => void;
  onRetryError?: (error: PaymentRetryError) => void;
  initialError?: string;
}

export function PaymentRetry({
  bookingId,
  walletAddress,
  onRetrySuccess,
  onRetryError,
  initialError = "Transaction failed due to network timeout or insufficient gas estimation.",
}: PaymentRetryProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [successResult, setSuccessResult] = useState<PaymentRetryOutput | null>(null);

  const handleRetry = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setAttempts((prev) => prev + 1);

    try {
      const input: PaymentRetryInput = {
        bookingId,
        walletAddress,
        idempotencyKey: `retry-${bookingId}-${Date.now()}`,
      };

      // Simulate payment retry contract invocation / backend call
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (attempts >= 2) {
            // Success on 3rd attempt or mocked pass
            resolve(true);
          } else if (Math.random() > 0.7) {
            reject(new Error("Stellar network congestion: retry required."));
          } else {
            resolve(true);
          }
        }, 2000);
      });

      const result: PaymentRetryOutput = {
        success: true,
        bookingId,
        txHash: `tx_hash_${Math.random().toString(36).substring(2, 15)}`,
        status: "confirmed",
        message: "Payment retry successful and confirmed on-chain.",
      };

      setSuccessResult(result);
      if (onRetrySuccess) {
        onRetrySuccess(result);
      }
    } catch (err: any) {
      const retryError: PaymentRetryError = {
        code: "PAYMENT_RETRY_FAILED",
        message: err.message || "Failed to process payment retry.",
        retryable: true,
        details: { attempts, bookingId },
      };
      setErrorMessage(retryError.message);
      if (onRetryError) {
        onRetryError(retryError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <ShieldAlert className="h-5 w-5" />
          Payment Failed - Action Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {successResult ? (
          <Alert className="border-green-500 bg-green-50 text-green-900">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="font-bold">Payment Recovered</AlertTitle>
            <AlertDescription>
              {successResult.message} (Tx: {successResult.txHash?.slice(0, 10)}...)
            </AlertDescription>
          </Alert> 
        ) : (
          <>
            {errorMessage && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error Details</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Booking ID: <strong className="text-foreground font-mono">{bookingId}</strong></span>
              <Badge variant="outline">Attempt {attempts + 1}</Badge>
            </div>

            <Button
              onClick={handleRetry}
              disabled={isLoading}
              className="w-full"
              variant="default"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Retrying Payment on Stellar...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry Payment
                </>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
