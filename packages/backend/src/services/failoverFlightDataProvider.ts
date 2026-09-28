/**
 * Flight provider failover (#779).
 *
 * Problem
 * -------
 * Flight search had exactly one data provider (the offchain repository). If it
 * threw — transient DB error, pool exhaustion — the whole search failed with a
 * 500 and there was no seam to fall back to another source.
 *
 * Contract
 * --------
 * FailoverFlightDataProvider implements the existing OffchainFlightDataProvider
 * seam (same inputs: FlightSearchCriteria + FlightPagination), so it drops into
 * FlightSearchService's optional `provider` argument unchanged.
 *
 *   Inputs : an ordered list of { name, provider } entries. Order is the
 *            failover priority — first entry is tried first.
 *   Outputs: the first provider's successful Flight[] result.
 *   Error cases:
 *     - every provider fails → FlightProviderUnavailableError carrying the
 *       per-attempt record (provider name, latency, error). The HTTP layer
 *       surfaces it as a 500; the message names every provider tried.
 *     - an empty provider list → constructed as invalid and throws
 *       FlightProviderUnavailableError immediately on use (defensive; the
 *       default factory never produces one).
 *
 * Behaviour:
 *   - providers are tried strictly in order; the first success wins and later
 *     providers are never invoked for that call
 *   - each attempt is timed and logged (provider, durationMs, error) so
 *     operators can see failover frequency in the logs
 *   - no retries *within* a provider — retry/policy concerns stay with each
 *     provider; this layer only switches sources
 */

import { logger } from '../utils/logger';
import {
  Flight,
  FlightPagination,
  FlightSearchCriteria,
} from '../types/flight';
import { OffchainFlightDataProvider } from './offchainFlightDataProvider';

export interface NamedFlightDataProvider {
  /** Stable identifier used in logs and error messages (e.g. "repository"). */
  name: string;
  provider: OffchainFlightDataProvider;
}

export interface FailoverAttempt {
  provider: string;
  succeeded: boolean;
  latencyMs: number;
  error?: string;
}

export class FlightProviderUnavailableError extends Error {
  readonly attempts: FailoverAttempt[];

  constructor(attempts: FailoverAttempt[]) {
    const tried = attempts.map((a) => a.provider).join(', ');
    const lastError = attempts[attempts.length - 1]?.error;
    super(
      `All flight providers failed (${tried})` +
        (lastError ? `: ${lastError}` : ''),
    );
    this.name = 'FlightProviderUnavailableError';
    this.attempts = attempts;
  }
}

export class FailoverFlightDataProvider implements OffchainFlightDataProvider {
  private readonly providers: NamedFlightDataProvider[];

  constructor(providers: NamedFlightDataProvider[]) {
    this.providers = providers;
  }

  async search(
    criteria: FlightSearchCriteria,
    pagination: FlightPagination,
  ): Promise<Flight[]> {
    if (this.providers.length === 0) {
      throw new FlightProviderUnavailableError([]);
    }

    const attempts: FailoverAttempt[] = [];

    for (const { name, provider } of this.providers) {
      const startedAt = Date.now();
      try {
        const flights = await provider.search(criteria, pagination);
        const latencyMs = Date.now() - startedAt;
        attempts.push({ provider: name, succeeded: true, latencyMs });
        if (attempts.length > 1) {
          logger.warn('Flight provider failover succeeded (#779)', {
            providerUsed: name,
            failedOverFrom: attempts.slice(0, -1).map((a) => a.provider),
            latencyMs,
          });
        } else {
          logger.debug('Flight provider succeeded', { provider: name, latencyMs });
        }
        return flights;
      } catch (error) {
        const latencyMs = Date.now() - startedAt;
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({
          provider: name,
          succeeded: false,
          latencyMs,
          error: message,
        });
        logger.warn('Flight provider failed, trying next (#779)', {
          provider: name,
          latencyMs,
          error: message,
        });
      }
    }

    throw new FlightProviderUnavailableError(attempts);
  }
}
