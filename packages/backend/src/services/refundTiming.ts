/** Timing rules for delayed refunds, shared by the refund service and tests. */

export interface DelayedRefundTiming {
  isDelayed?: boolean | null;
  delayedUntil?: Date | null;
}

/**
 * A delayed refund is ready once its timelock has elapsed. A refund that is
 * not delayed, or that has no timelock date, is never selected by the delayed
 * processor.
 */
export function isDelayedRefundReady(
  refund: DelayedRefundTiming,
  now: Date = new Date(),
): boolean {
  if (!refund.isDelayed || !refund.delayedUntil) return false;
  return refund.delayedUntil.getTime() <= now.getTime();
}
