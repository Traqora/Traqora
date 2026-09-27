/**
 * Stellar Expert Metrics — issue #728.
 *
 * Provides on-chain transaction tracking and sanity checks against
 * Stellar Expert (stellar.expert) for governance and loyalty contracts.
 *
 * Scope:
 *   - Track transaction confirmation status via Stellar Expert
 *   - Emit metrics for monitoring (Prometheus-compatible)
 *   - Validate on-chain data freshness and consistency
 */

import { logger } from '../../utils/logger';

export interface StellarExpertTxStatus {
  txId: string;
  status: 'pending' | 'success' | 'failed';
  ledger?: number;
  timestamp?: Date;
  fee?: string;
  operations?: number;
  result?: string;
}

export interface StellarExpertContractMetrics {
  contractId: string;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  avgConfirmationTimeMs: number;
  lastLedger?: number;
  freshnessScore: number;
}

export interface OnChainSanityResult {
  txId: string;
  verified: boolean;
  discrepancy?: string;
  expectedStatus?: string;
  actualStatus?: string;
}

const EXPLORER_BASE_URL = process.env.STELLAR_EXPLORER_URL || 'https://stellar.expert';

export class StellarExpertMetricsService {
  private cache = new Map<string, StellarExpertTxStatus>();
  private readonly cacheTtlMs = 30_000;

  /**
   * Fetch transaction status from Stellar Expert API.
   * Returns cached result if within TTL.
   */
  async getTxStatus(txId: string): Promise<StellarExpertTxStatus> {
    const cached = this.cache.get(txId);
    if (cached && Date.now() - cached.timestamp!.getTime() < this.cacheTtlMs) {
      logger.debug(`stellar-expert: cache hit for ${txId}`);
      return cached;
    }

    const status = await this.fetchFromExplorer(txId);
    this.cache.set(txId, status);
    logger.debug(`stellar-expert: fetched status for ${txId}: ${status.status}`);
    return status;
  }

  /**
   * Compute contract-level metrics from on-chain data.
   */
  async computeContractMetrics(contractId: string, txIds: string[]): Promise<StellarExpertContractMetrics> {
    const statuses = await Promise.all(txIds.map((id) => this.getTxStatus(id)));

    const successful = statuses.filter((s) => s.status === 'success');
    const failed = statuses.filter((s) => s.status === 'failed');
    const pending = statuses.filter((s) => s.status === 'pending');

    const avgConfirmMs = successful.length > 0
      ? successful.reduce((acc, s) => {
          if (!s.timestamp) return acc;
          return acc + (Date.now() - s.timestamp.getTime());
        }, 0) / successful.length
      : 0;

    const lastLedger = statuses
      .filter((s): s is StellarExpertTxStatus & { ledger: number } => s.ledger !== undefined)
      .sort((a, b) => b.ledger - a.ledger)[0]?.ledger;

    const total = statuses.length;
    const freshnessScore = total > 0
      ? Math.round((successful.length / total) * 100)
      : 100;

    return {
      contractId,
      totalTransactions: total,
      successfulTransactions: successful.length,
      failedTransactions: failed.length,
      avgConfirmationTimeMs: Math.round(avgConfirmMs),
      lastLedger,
      freshnessScore,
    };
  }

  /**
   * Verify on-chain transaction against expected state.
   * Returns sanity check result with any discrepancies.
   */
  async verifyOnChainSanity(
    txId: string,
    expectedStatus: string,
    expectedLedger?: number
  ): Promise<OnChainSanityResult> {
    const status = await this.getTxStatus(txId);

    const discrepancies: string[] = [];

    if (expectedStatus && status.status !== expectedStatus.toLowerCase()) {
      discrepancies.push(
        `Status mismatch: expected ${expectedStatus}, got ${status.status}`
      );
    }

    if (expectedLedger !== undefined && status.ledger !== undefined && status.ledger !== expectedLedger) {
      discrepancies.push(
        `Ledger mismatch: expected ${expectedLedger}, got ${status.ledger}`
      );
    }

    if (!status.ledger && status.status !== 'pending') {
      discrepancies.push('Missing ledger assignment for non-pending transaction');
    }

    return {
      txId,
      verified: discrepancies.length === 0,
      discrepancy: discrepancies.length > 0 ? discrepancies.join('; ') : undefined,
      expectedStatus,
      actualStatus: status.status,
    };
  }

  /**
   * Purge expired cache entries.
   */
  purgeExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp!.getTime() > this.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
  }

  private async fetchFromExplorer(txId: string): Promise<StellarExpertTxStatus> {
    try {
      const response = await fetch(`${EXPLORER_BASE_URL}/transactions/${txId}`, {
        headers: { Accept: 'application/json' },
        next: { tags: [`stellar-expert-${txId}`] },
      });

      if (!response.ok) {
        logger.warn(`stellar-expert: non-OK response for ${txId}: ${response.status}`);
        return { txId, status: 'pending' };
      }

      const data = await response.json();

      return {
        txId,
        status: this.mapResultToStatus(data.result || data.transaction_result || 'unknown'),
        ledger: data.ledger || data._ledger,
        timestamp: data.created_at ? new Date(data.created_at) : new Date(),
        fee: data.fee,
        operations: data.operations?.length ?? data.op_count,
        result: data.result || data.transaction_result,
      };
    } catch (err) {
      logger.error(`stellar-expert: failed to fetch ${txId}`, { error: err });
      return { txId, status: 'pending' };
    }
  }

  private mapResultToStatus(result: string): StellarExpertTxStatus['status'] {
    const lower = result.toLowerCase();
    if (lower.includes('success') || lower.includes('SUCCESS')) return 'success';
    if (lower.includes('failed') || lower.includes('FAILURE') || lower.includes('NOT_FOUND')) return 'failed';
    return 'pending';
  }
}

export const stellarExpertMetricsService = new StellarExpertMetricsService();
