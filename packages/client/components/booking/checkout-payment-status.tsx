"use client";

import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  CheckoutPaymentStatus,
  CHECKOUT_PAYMENT_STATUS_COPY,
} from './checkout-payment-status';

export interface CheckoutPaymentStatusViewProps {
  status: CheckoutPaymentStatus;
  bookingId?: string;
  txHash?: string | null;
  errorMessage?: string | null;
  attemptsCount?: number;
  onRetry?: () => void;
  onViewBooking?: () => void;
  onReset?: () => void;
}

function StatusIcon({ status }: { status: CheckoutPaymentStatus }) {
  const className = "h-5 w-5 shrink-0";
  switch (status) {
    case 'confirmed':
      return <CheckCircle2 className={`${className} text-green-600 dark:text-green-500`} aria-hidden="true" />;
    case 'submitted':
      return <Loader2 className={`${className} animate-spin text-blue-600 dark:text-blue-400`} aria-hidden="true" />;
    case 'awaiting_approval':
      return <Clock className={`${className} text-primary animate-pulse`} aria-hidden="true" />;
    case 'recoverable_pending':
      return <AlertTriangle className={`${className} text-amber-500`} aria-hidden="true" />;
    case 'failed':
      return <AlertCircle className={`${className} text-destructive`} aria-hidden="true" />;
  }
}

function getBadgeVariant(status: CheckoutPaymentStatus): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'confirmed':
      return 'secondary';
    case 'submitted':
    case 'awaiting_approval':
      return 'outline';
    case 'recoverable_pending':
      return 'default';
    case 'failed':
      return 'destructive';
  }
}

export function CheckoutPaymentStatusView({
  status,
  bookingId,
  txHash,
  errorMessage,
  attemptsCount = 1,
  onRetry,
  onViewBooking,
  onReset,
}: CheckoutPaymentStatusViewProps) {
  const copy = CHECKOUT_PAYMENT_STATUS_COPY[status];

  return (
    <Card
      role="status"
      aria-live="polite"
      data-state={status}
      className={`border transition-all ${
        status === 'failed'
          ? 'border-destructive/40 bg-destructive/5'
          : status === 'recoverable_pending'
          ? 'border-amber-500/40 bg-amber-50/20 dark:bg-amber-950/20'
          : status === 'confirmed'
          ? 'border-green-500/40 bg-green-50/20 dark:bg-green-950/20'
          : 'border-border'
      }`}
    >
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-start gap-3">
          <StatusIcon status={status} />
          <div>
            <CardTitle className="text-lg font-serif">{copy.title}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              {copy.description}
            </CardDescription>
          </div>
        </div>
        <Badge variant={getBadgeVariant(status)} className="capitalize">
          {copy.badgeText}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 pt-2">
        {bookingId && (
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-2">
            <span>Booking Reference</span>
            <span className="font-mono text-foreground font-medium">{bookingId}</span>
          </div>
        )}

        {txHash && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Transaction Hash</span>
            <span className="font-mono text-foreground">
              {txHash.slice(0, 10)}...{txHash.slice(-6)}
            </span>
          </div>
        )}

        {errorMessage && status !== 'confirmed' && (
          <div className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Note: </span>
            {errorMessage}
          </div>
        )}

        {attemptsCount > 1 && status === 'recoverable_pending' && (
          <p className="text-xs text-muted-foreground">
            Attempt {attemptsCount} completed. Itinerary is held.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {status === 'confirmed' && onViewBooking && (
            <Button onClick={onViewBooking} className="w-full sm:w-auto">
              {copy.actionLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}

          {status === 'recoverable_pending' && onRetry && (
            <Button onClick={onRetry} variant="default" className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              {copy.actionLabel}
            </Button>
          )}

          {status === 'failed' && onReset && (
            <Button onClick={onReset} variant="outline" className="w-full sm:w-auto">
              {copy.actionLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
