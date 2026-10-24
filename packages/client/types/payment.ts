export type PaymentStatus = 'pending' | 'processing' | 'confirmed' | 'failed';

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
