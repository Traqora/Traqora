/**
 * Issue #728: Stellar Expert transaction metrics.
 *
 * This document describes the Stellar Expert metrics tracking service
 * that provides on-chain transaction monitoring and sanity checks.
 *
 * ## Endpoints
 *
 * | Method | Path | Description |
 * |--------|------|-------------|
 * | GET | /api/v1/stellar-expert/status/:txId | Fetch transaction status |
 * | GET | /api/v1/stellar-expert/metrics/:contractId | Contract-level metrics |
 * | POST | /api/v1/stellar-expert/verify | On-chain sanity verification |
 *
 * ## Configuration
 *
 * Set `STELLAR_EXPLORER_URL` environment variable (defaults to stellar.expert).
 *
 * ## Metrics
 *
 * The service exposes:
 * - Transaction confirmation status
 * - Contract-level success/failure rates
 * - Average confirmation times
 * - On-chain data freshness scores
 *
 * ## Caching
 *
 * Results are cached for 30 seconds (configurable via `cacheTtlMs`).
 */

export const STELLAR_EXPERT_DOCS = `See backend/src/services/analytics/stellarExpertMetrics.ts for implementation.`;
