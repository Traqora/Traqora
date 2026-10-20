/**
 * Fee-bump transaction tracking (#923).
 *
 * Stellar fee-bump transactions have two hashes:
 *   - the outer fee-bump envelope hash, which is what the network records as
 *     the submitted transaction;
 *   - the inner transaction hash, which is the actual booking operation.
 *
 * Retries and booking status must not confuse the two. These helpers describe
 * an envelope once, then resolve the final ledger outcome from the outer and
 * (when needed) inner transaction status without letting a `not_found` on one
 * hash mask a settled result on the other.
 */

import {
  FeeBumpTransaction,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

export type LedgerTransactionStatus = 'pending' | 'success' | 'failed' | 'not_found';

/** Structural copy of `services/soroban`'s TransactionStatus. */
export interface TransactionStatusLike {
  status: LedgerTransactionStatus;
  txHash?: string;
  result?: unknown;
  error?: string;
}

export interface TransactionEnvelopeReference {
  isFeeBump: boolean;
  /** Hash the network records for the submitted envelope (outer hash). */
  submittedTxHash: string;
  /** Hash of the inner transaction (equal to submittedTxHash when not bumped). */
  innerTxHash: string;
  /** Present only for fee-bump envelopes. */
  feeBumpTxHash?: string;
}

export interface ResolvedTransactionStatus extends TransactionStatusLike {
  isFeeBump: boolean;
  submittedTxHash: string;
  innerTxHash: string;
  feeBumpTxHash?: string;
  /** Which hash the final status was observed against: 'outer' or 'inner'. */
  observedOn: 'outer' | 'inner';
}

function hashOf(transaction: Transaction | FeeBumpTransaction): string {
  return transaction.hash().toString('hex');
}

export function describeTransactionEnvelope(
  transaction: Transaction | FeeBumpTransaction,
): TransactionEnvelopeReference {
  if (transaction instanceof FeeBumpTransaction) {
    const feeBumpTxHash = hashOf(transaction);
    const innerTxHash = hashOf(transaction.innerTransaction);
    return {
      isFeeBump: true,
      submittedTxHash: feeBumpTxHash,
      innerTxHash,
      feeBumpTxHash,
    };
  }

  const txHash = hashOf(transaction);
  return {
    isFeeBump: false,
    submittedTxHash: txHash,
    innerTxHash: txHash,
  };
}

export function describeTransactionXdr(
  xdr: string,
  networkPassphrase: string,
): TransactionEnvelopeReference {
  return describeTransactionEnvelope(
    TransactionBuilder.fromXDR(xdr, networkPassphrase),
  );
}

function isFinal(status: TransactionStatusLike | undefined): boolean {
  return status?.status === 'success' || status?.status === 'failed';
}

/**
 * Pick the final ledger outcome in this order:
 *   1. the outer/submitted transaction, if settled;
 *   2. the inner transaction, if settled (covers a retry that submitted the
 *      inner transaction directly);
 *   3. pending/not_found, preferring the outer hash as the canonical submission.
 */
export function resolveFeeBumpOutcome(params: {
  reference: TransactionEnvelopeReference;
  outer?: TransactionStatusLike;
  inner?: TransactionStatusLike;
}): ResolvedTransactionStatus {
  const { reference, outer, inner } = params;

  if (isFinal(outer)) {
    return {
      ...outer!,
      txHash: reference.submittedTxHash,
      isFeeBump: reference.isFeeBump,
      submittedTxHash: reference.submittedTxHash,
      innerTxHash: reference.innerTxHash,
      feeBumpTxHash: reference.feeBumpTxHash,
      observedOn: 'outer',
    };
  }

  if (isFinal(inner)) {
    return {
      ...inner!,
      txHash: reference.submittedTxHash,
      isFeeBump: reference.isFeeBump,
      submittedTxHash: reference.submittedTxHash,
      innerTxHash: reference.innerTxHash,
      feeBumpTxHash: reference.feeBumpTxHash,
      observedOn: 'inner',
    };
  }

  const observedOn: 'outer' | 'inner' =
    outer?.status === 'pending' || !inner || inner.status !== 'pending'
      ? 'outer'
      : 'inner';
  const node = observedOn === 'outer' ? outer : inner;

  return {
    status: node?.status ?? 'not_found',
    txHash: reference.submittedTxHash,
    error: node?.error,
    result: node?.result,
    isFeeBump: reference.isFeeBump,
    submittedTxHash: reference.submittedTxHash,
    innerTxHash: reference.innerTxHash,
    feeBumpTxHash: reference.feeBumpTxHash,
    observedOn,
  };
}

/**
 * Reference used when only a stored hash is available (for example an older
 * booking created before inner hashes were persisted).
 */
export function referenceFromStoredHashes(params: {
  submittedTxHash: string;
  innerTxHash?: string | null;
  feeBumpTxHash?: string | null;
}): TransactionEnvelopeReference {
  const feeBumpTxHash = params.feeBumpTxHash || undefined;
  return {
    isFeeBump: Boolean(feeBumpTxHash),
    submittedTxHash: params.submittedTxHash,
    innerTxHash: params.innerTxHash || params.submittedTxHash,
    feeBumpTxHash,
  };
}
