import type { BookingStatus } from '../db/entities/Booking';
import type { ContractReconciliationOutcome } from '../db/entities/ContractReconciliationAttempt';
import { logger } from '../utils/logger';

/**
 * Repairable reconciliation between indexed on-chain booking events and the
 * backend booking rows (#934).
 *
 * The indexer archive (`contract_event_logs`) is the authoritative side. This
 * service finds bookings whose persisted status disagrees with the latest
 * indexed lifecycle event, applies the expected status, and records one
 * attempt row per repair (success or failure). A failed attempt changes
 * nothing else, so the next run retries it.
 */

export interface IndexedContractEvent {
  id?: string;
  contractId: string;
  eventType: string;
  ledger: number;
  sorobanBookingId: string | null;
  indexedAt?: Date | string | null;
}

export interface ReconciliationBooking {
  id: string;
  status: string;
  sorobanBookingId: string | null;
}

export interface ContractEventSource {
  /**
   * Return recent indexed events, newest first. Implementations should apply
   * `contractIds` and `limit` in the database rather than loading everything.
   */
  listAuthoritativeEvents(options: {
    contractIds?: string[];
    limit: number;
  }): Promise<IndexedContractEvent[]>;
}

export interface ReconciliationBookingStore {
  findBySorobanBookingIds(ids: string[]): Promise<ReconciliationBooking[]>;
  saveStatus(bookingId: string, status: BookingStatus): Promise<void>;
}

export interface RepairAttemptInput {
  bookingId: string;
  sorobanBookingId: string | null;
  contractId: string | null;
  eventType: string | null;
  eventLedger: number | null;
  previousStatus: string | null;
  expectedStatus: string;
  outcome: ContractReconciliationOutcome;
  error: string | null;
}

export interface ReconciliationAttemptStore {
  record(attempt: RepairAttemptInput): Promise<void>;
}

export interface ReconcileOptions {
  eventSource: ContractEventSource;
  bookings: ReconciliationBookingStore;
  attempts: ReconciliationAttemptStore;
  contractIds?: string[];
  /** Maximum recent events considered by this run. */
  limit?: number;
  /** Detect and report mismatches without writing booking state/attempts. */
  dryRun?: boolean;
}

export interface ReconciliationSummary {
  scannedEvents: number;
  candidateBookings: number;
  mismatches: number;
  repaired: number;
  failed: number;
  unchanged: number;
  skipped: number;
  dryRun: boolean;
}

/**
 * Status implied by each booking-contract event. Event names are matched
 * case-insensitively because both the booking contract (`created`) and refund
 * contract (`RefundProcessed`) publish mixed-case topics.
 */
export const BOOKING_EVENT_STATUS: Record<string, BookingStatus> = {
  created: 'onchain_submitted',
  paid: 'paid',
  released: 'confirmed',
  refunded: 'refunded',
  refundprocessed: 'refunded',
};

export function expectedStatusForEventType(
  eventType: string | null | undefined,
): BookingStatus | null {
  if (!eventType) return null;
  const key = eventType.trim().toLowerCase();

  if (Object.prototype.hasOwnProperty.call(BOOKING_EVENT_STATUS, key)) {
    return BOOKING_EVENT_STATUS[key];
  }

  return null;
}

const eventRecency = (event: IndexedContractEvent): number => {
  const timestamp =
    event.indexedAt instanceof Date
      ? event.indexedAt.getTime()
      : typeof event.indexedAt === 'string'
        ? new Date(event.indexedAt).getTime()
        : 0;

  return Number.isFinite(timestamp) ? timestamp : 0;
};

/**
 * Keep only the most recent lifecycle event per Soroban booking id. Ledger is
 * the primary ordering; `indexedAt` and id break ties deterministically.
 */
export function selectLatestAuthoritativeEvents(
  events: IndexedContractEvent[],
): Map<string, IndexedContractEvent> {
  const latest = new Map<string, IndexedContractEvent>();

  for (const event of events) {
    if (!event.sorobanBookingId) continue;
    if (!expectedStatusForEventType(event.eventType)) continue;

    const current = latest.get(event.sorobanBookingId);
    if (!current) {
      latest.set(event.sorobanBookingId, event);
      continue;
    }

    const eventIsNewer =
      event.ledger > current.ledger ||
      (event.ledger === current.ledger &&
        (eventRecency(event) > eventRecency(current) ||
          (eventRecency(event) === eventRecency(current) &&
            String(event.id ?? '') > String(current.id ?? ''))));

    if (eventIsNewer) {
      latest.set(event.sorobanBookingId, event);
    }
  }

  return latest;
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function reconcileContractBookingStates(
  options: ReconcileOptions,
): Promise<ReconciliationSummary> {
  const limit = options.limit ?? 500;
  const dryRun = options.dryRun === true;

  const events = await options.eventSource.listAuthoritativeEvents({
    contractIds: options.contractIds,
    limit,
  });

  const latestEvents = selectLatestAuthoritativeEvents(events);
  const summary: ReconciliationSummary = {
    scannedEvents: events.length,
    candidateBookings: latestEvents.size,
    mismatches: 0,
    repaired: 0,
    failed: 0,
    unchanged: 0,
    skipped: 0,
    dryRun,
  };

  if (latestEvents.size === 0) {
    return summary;
  }

  const bookingIds = Array.from(latestEvents.keys());
  const bookings = await options.bookings.findBySorobanBookingIds(bookingIds);
  const bookingsBySorobanId = new Map<string, ReconciliationBooking>();

  for (const booking of bookings) {
    if (!booking.sorobanBookingId) continue;
    if (!bookingsBySorobanId.has(booking.sorobanBookingId)) {
      bookingsBySorobanId.set(booking.sorobanBookingId, booking);
    }
  }

  for (const [sorobanBookingId, event] of latestEvents) {
    const expectedStatus = expectedStatusForEventType(event.eventType);
    if (!expectedStatus) {
      summary.skipped += 1;
      continue;
    }

    const booking = bookingsBySorobanId.get(sorobanBookingId);
    if (!booking) {
      // Nothing to repair: either the booking was never persisted or it is
      // still being created. It will be considered again on the next run.
      summary.skipped += 1;
      logger.warn('Reconciliation found an indexed booking with no backend row', {
        sorobanBookingId,
        contractId: event.contractId,
        eventType: event.eventType,
        ledger: event.ledger,
      });
      continue;
    }

    if (booking.status === expectedStatus) {
      summary.unchanged += 1;
      continue;
    }

    summary.mismatches += 1;

    if (dryRun) {
      logger.info('Reconciliation detected a booking mismatch (dry run)', {
        bookingId: booking.id,
        sorobanBookingId,
        previousStatus: booking.status,
        expectedStatus,
        ledger: event.ledger,
      });
      continue;
    }

    try {
      await options.bookings.saveStatus(booking.id, expectedStatus);
      summary.repaired += 1;

      await recordAttempt(options.attempts, {
        bookingId: booking.id,
        sorobanBookingId,
        contractId: event.contractId ?? null,
        eventType: event.eventType ?? null,
        eventLedger: event.ledger ?? null,
        previousStatus: booking.status,
        expectedStatus,
        outcome: 'repaired',
        error: null,
      });

      logger.info('Reconciliation repaired booking status', {
        bookingId: booking.id,
        sorobanBookingId,
        previousStatus: booking.status,
        expectedStatus,
        ledger: event.ledger,
      });
    } catch (error) {
      summary.failed += 1;

      await recordAttempt(options.attempts, {
        bookingId: booking.id,
        sorobanBookingId,
        contractId: event.contractId ?? null,
        eventType: event.eventType ?? null,
        eventLedger: event.ledger ?? null,
        previousStatus: booking.status,
        expectedStatus,
        outcome: 'failed',
        error: errorMessage(error),
      });

      logger.error('Reconciliation failed to repair booking status', {
        bookingId: booking.id,
        sorobanBookingId,
        previousStatus: booking.status,
        expectedStatus,
        error: errorMessage(error),
      });
    }
  }

  return summary;
}

/**
 * Recording an attempt must never hide the repair result. If the audit write
 * fails we log it; the summary still reflects whether the booking changed.
 */
async function recordAttempt(
  attempts: ReconciliationAttemptStore,
  attempt: RepairAttemptInput,
): Promise<void> {
  try {
    await attempts.record(attempt);
  } catch (error) {
    logger.error('Failed to record contract reconciliation attempt', {
      bookingId: attempt.bookingId,
      sorobanBookingId: attempt.sorobanBookingId,
      outcome: attempt.outcome,
      error: errorMessage(error),
    });
  }
}
