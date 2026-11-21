/**
 * SLO measurement helpers for the booking funnel (issue #593).
 *
 * The Prometheus side of the SLO pipeline lives in
 * monitoring/prometheus/slo-rules.yml (recording rules + burn-rate alerts)
 * and monitoring/grafana/dashboards/traqora-slo.json (dashboards). This module
 * is the backend hook: `sloMeasure` times an async operation and classifies it
 * good/bad against the latency target defined in `services/metrics.ts`.
 *
 * Instrumented operations:
 *   - search  : end-to-end flight search latency (cache hit or miss)
 *   - booking : asynchronous on-chain confirmation polling, through a terminal
 *               confirmation or failure
 *   - refund  : refund processing through completion or rejection
 */

import { recordSloLatency, SloOperation } from '../services/metrics';

/**
 * Time an async operation and record its latency against the operation's SLO
 * target. The result is classified good/bad and re-throws on failure so the
 * caller's error handling is unchanged.
 */
export async function sloMeasure<T>(operation: SloOperation, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordSloLatency(operation, (Date.now() - start) / 1000);
    return result;
  } catch (error) {
    recordSloLatency(operation, (Date.now() - start) / 1000, true);
    throw error;
  }
}
