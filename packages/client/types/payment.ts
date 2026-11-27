export type PaymentStatus = 'pending' | 'processing' | 'confirmed' | 'failed';

/**
 * Checkout payment status lifecycle states:
 * - awaiting_approval: User prompt open in wallet
 * - submitted: Transaction submitted to Stellar network / mempool
 * - confirmed: Confirmed on blockchain
 * - failed: Terminal failure (e.g. signature rejected, invalid params)
 * - recoverable_pending: Transient/retryable delay or timeout where booking is safely held
 */
export type CheckoutPaymentStatus =
  | 'awaiting_approval'
  | 'submitted'
  | 'confirmed'
  | 'failed'
  | 'recoverable_pending';

export interface CheckoutPaymentStateInput {
  signingStatus?: string | null;
  transactionStatus?: string | null;
  bookingStatus?: string | null;
  isProcessing?: boolean;
  hasError?: boolean;
  errorMessage?: string | null;
  isRetryable?: boolean;
  attemptsCount?: number;
}

export interface CheckoutPaymentStatusCopy {
  title: string;
  description: string;
  badgeText: string;
  actionLabel: string | null;
  secondaryActionLabel?: string | null;
}

export interface PaymentRetryInput {
  bookingId: string;
  walletAddress?: string;
  idempotencyKey?: string;
}

export interface PaymentRetryOutput {
  success: boolean;
  bookingId: string;
  txHash?: string;
  status: PaymentStatus;
  message?: string;
}

export interface PaymentRetryError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, any>;
}

export interface PaymentRetryState {
  isLoading: boolean;
  error: PaymentRetryError | null;
  lastAttemptAt?: Date;
  attemptsCount: number;
}
