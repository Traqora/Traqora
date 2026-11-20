/**
 * Explicit cancellation confirmation contract (issue #1150).
 *
 * A traveler must see and agree to the exact refund terms before a
 * cancellation is processed. The client calls `GET /:id/cancellation-refund`
 * first and echoes the quoted net refund back with the cancel request. The
 * helpers here make that round trip enforceable on the server.
 */
import { BadRequestError, ConflictError } from '../utils/errors';
import type { CancellationRefund } from './fareRulesService';

/** Bump when the displayed terms change shape so stale clients are rejected. */
export const CANCELLATION_TERMS_VERSION = 'v1';

export interface CancellationConfirmation {
  confirm: boolean;
  termsVersion: string;
  expectedNetRefundCents: number;
  idempotencyKey?: string;
}

/**
 * Reject a cancellation whose confirmation does not match the live quote.
 * A mismatch means the traveler is looking at stale terms, so no supplier
 * cancellation or refund action is taken.
 */
export function assertCancellationConfirmation(
  refund: CancellationRefund,
  confirmation: CancellationConfirmation,
): void {
  if (confirmation.confirm !== true) {
    throw new BadRequestError('Explicit cancellation confirmation is required');
  }

  if (confirmation.termsVersion !== CANCELLATION_TERMS_VERSION) {
    throw new BadRequestError('Unsupported cancellation terms version', {
      expected: CANCELLATION_TERMS_VERSION,
      received: confirmation.termsVersion,
    });
  }

  if (!Number.isInteger(confirmation.expectedNetRefundCents) || confirmation.expectedNetRefundCents < 0) {
    throw new BadRequestError('expectedNetRefundCents must be a non-negative integer');
  }

  if (confirmation.expectedNetRefundCents !== refund.netRefundCents) {
    throw new ConflictError('Cancellation terms changed; review the updated refund quote', {
      expectedNetRefundCents: confirmation.expectedNetRefundCents,
      currentNetRefundCents: refund.netRefundCents,
    });
  }
}
