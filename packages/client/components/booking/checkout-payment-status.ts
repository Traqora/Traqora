/**
 * Pure resolver and state definitions for checkout payment status.
 *
 * Communicates the five canonical v1 checkout payment states:
 * - awaiting_approval
 * - submitted
 * - confirmed
 * - failed
 * - recoverable_pending
 */

import {
  CheckoutPaymentStatus,
  CheckoutPaymentStateInput,
  CheckoutPaymentStatusCopy,
} from '@/types/payment';

export const CONFIRMED_STATUSES = new Set([
  'success',
  'confirmed',
  'completed',
  'paid',
]);

export const SUBMITTED_STATUSES = new Set([
  'submitted',
  'onchain_submitted',
  'onchain_pending',
  'submitting',
  'confirming',
  'not_found',
  'processing',
  'payment_processing',
]);

export const RECOVERABLE_ERROR_CODES = new Set([
  'SIGNING_TIMEOUT',
  'NETWORK_TIMEOUT',
  'UPSTREAM_UNAVAILABLE',
  'CONGESTION',
  'RATE_LIMITED',
  'PAYMENT_RETRYABLE',
]);

/**
 * Derives the single unambiguous CheckoutPaymentStatus from current flow signals.
 *
 * Evaluation priority:
 * 1. Settled on-chain confirmation -> 'confirmed'
 * 2. Recoverable errors / timeouts / retryable flags -> 'recoverable_pending'
 * 3. Terminal or non-retryable failures -> 'failed'
 * 4. Submitted to mempool / ledger pending -> 'submitted'
 * 5. Awaiting user approval / signature in wallet -> 'awaiting_approval'
 * 6. Default fallback -> 'awaiting_approval' if actively processing, otherwise 'failed' if error
 */
export function resolveCheckoutPaymentStatus(
  input: CheckoutPaymentStateInput,
): CheckoutPaymentStatus {
  const {
    signingStatus = null,
    transactionStatus = null,
    bookingStatus = null,
    isProcessing = false,
    hasError = false,
    errorMessage = null,
    isRetryable = false,
  } = input;

  const txNorm = transactionStatus?.toLowerCase();
  const bkNorm = bookingStatus?.toLowerCase();
  const signNorm = signingStatus?.toLowerCase();

  // 1. Confirmed / Settled
  if (
    (txNorm && CONFIRMED_STATUSES.has(txNorm)) ||
    (bkNorm && CONFIRMED_STATUSES.has(bkNorm))
  ) {
    return 'confirmed';
  }

  // 2. Recoverable pending conditions
  if (
    signNorm === 'timeout' ||
    (hasError && isRetryable) ||
    (errorMessage &&
      RECOVERABLE_ERROR_CODES.has(errorMessage.toUpperCase()))
  ) {
    return 'recoverable_pending';
  }

  // 3. Terminal / Non-recoverable failure
  if (
    signNorm === 'rejected' ||
    signNorm === 'error' ||
    txNorm === 'failed' ||
    (hasError && !isRetryable && !signNorm)
  ) {
    return 'failed';
  }

  // 4. Submitted to network
  if (
    (txNorm && SUBMITTED_STATUSES.has(txNorm)) ||
    (bkNorm && SUBMITTED_STATUSES.has(bkNorm)) ||
    signNorm === 'success'
  ) {
    return 'submitted';
  }

  // 5. Awaiting wallet approval
  if (
    signNorm === 'pending' ||
    signNorm === 'idle' ||
    isProcessing
  ) {
    return 'awaiting_approval';
  }

  return hasError ? 'failed' : 'awaiting_approval';
}

export const CHECKOUT_PAYMENT_STATUS_COPY: Record<
  CheckoutPaymentStatus,
  CheckoutPaymentStatusCopy
> = {
  awaiting_approval: {
    title: 'Awaiting Wallet Approval',
    description:
      'Please inspect and approve the transaction in your connected Stellar wallet.',
    badgeText: 'Awaiting Approval',
    actionLabel: null,
  },
  submitted: {
    title: 'Transaction Submitted',
    description:
      'Your payment transaction has been submitted to the network. Waiting for blockchain confirmation.',
    badgeText: 'Submitted',
    actionLabel: null,
  },
  confirmed: {
    title: 'Payment Confirmed',
    description:
      'Your payment has been verified on the blockchain. Your booking is secured.',
    badgeText: 'Confirmed',
    actionLabel: 'View Booking',
  },
  failed: {
    title: 'Payment Failed',
    description:
      'The payment could not be processed. No funds were transferred.',
    badgeText: 'Failed',
    actionLabel: 'Try Again',
  },
  recoverable_pending: {
    title: 'Payment Pending Verification',
    description:
      'A network delay occurred. Your booking is held and you can safely retry without duplicate charges.',
    badgeText: 'Recoverable Pending',
    actionLabel: 'Retry Payment',
    secondaryActionLabel: 'Check Status',
  },
};
