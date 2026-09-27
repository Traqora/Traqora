/**
 * Idempotent booking confirm retry (#784).
 *
 * Problem
 * -------
 * The "successful Soroban transaction ⇒ booking.status = confirmed" transition
 * existed in three places (booking poller, bookings route, transactions route)
 * with divergent, duplicated logic. Re-polling a transaction that had already
 * confirmed re-saved and re-broadcast the booking, and one call site read a
 * `bookingId` property off a scVal that does not carry one.
 *
 * Contract
 * --------
 * applyConfirmTransition — pure function, no I/O:
 *   Inputs : booking snapshot (status + optional on-chain booking id) and the
 *            latest Soroban TransactionStatus, plus an optional `now` override
 *            for tests.
 *   Outputs: ConfirmTransitionResult
 *              outcome  — 'already_confirmed' | 'confirmed' | 'failed' |
 *                         'left_pending'
 *              changed  — true only when a field actually moved (status flip or
 *                         first-time on-chain booking id capture)
 *              toStatus — the status the caller must persist when changed
 *              reason   — failure explanation for outcome 'failed'
 *   Error cases: none — total function; transport errors surface from callers.
 *
 *   Rules:
 *     success:
 *       - already 'confirmed' → no-op (idempotent replay), except a first-time
 *         capture of the on-chain booking id, which counts as a change
 *       - otherwise           → confirm; capture the on-chain booking id when
 *         present
 *     failed:
 *       - already 'failed'    → no-op (no second save / no error overwrite)
 *       - otherwise           → fail with transactionStatus.error as reason
 *     pending / not_found     → 'left_pending' (callers simply poll again)
 *
 * confirmBookingTx — orchestration wrapper:
 *   Loads the booking, reads the transaction status once, applies the pure
 *   transition, and persists only when `changed` is true. Unknown booking →
 *   BadRequestError (404 at the route layer). A booking without a tx hash is
 *   simply 'left_pending'.
 */

import { logger } from "../utils/logger";
import { BadRequestError } from "../utils/errors";
import { withRetries } from "./retry";
import {
  getTransactionStatus,
  type TransactionStatus,
} from "./soroban";
import { AppDataSource } from "../db/dataSource";
import { Booking, BookingStatus } from "../db/entities/Booking";

export type ConfirmOutcome =
  | "already_confirmed"
  | "confirmed"
  | "failed"
  | "left_pending";

export interface ConfirmTransitionInput {
  booking: {
    status: BookingStatus;
    sorobanBookingId?: string | null;
    lastError?: string | null;
  };
  transactionStatus: TransactionStatus;
  now?: Date;
}

export interface ConfirmTransitionResult {
  outcome: ConfirmOutcome;
  changed: boolean;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  /** On-chain booking id captured during this transition, when available. */
  onChainBookingId?: string | null;
  /** Failure explanation — set only for outcome 'failed'. */
  reason?: string;
}

/**
 * Extract the on-chain booking id from a Soroban return value. The value is a
 * scVal: usually a bare id, occasionally an object carrying { bookingId }.
 */
export function parseOnChainBookingId(result: unknown): string | null {
  if (result === null || result === undefined) return null;
  if (typeof result === "object") {
    const bookingId = (result as { bookingId?: unknown }).bookingId;
    if (bookingId === null || bookingId === undefined) return null;
    return String(bookingId);
  }
  const asString = String(result);
  return asString.length > 0 ? asString : null;
}

export function applyConfirmTransition(
  input: ConfirmTransitionInput,
): ConfirmTransitionResult {
  const { booking, transactionStatus } = input;
  const fromStatus = booking.status;

  if (transactionStatus.status === "success") {
    const onChainBookingId = parseOnChainBookingId(transactionStatus.result);

    if (fromStatus === "confirmed") {
      // Idempotent replay — only a missing booking id is worth writing back.
      if (onChainBookingId && !booking.sorobanBookingId) {
        return {
          outcome: "confirmed",
          changed: true,
          fromStatus,
          toStatus: "confirmed",
          onChainBookingId,
        };
      }
      return {
        outcome: "already_confirmed",
        changed: false,
        fromStatus,
        toStatus: "confirmed",
        onChainBookingId: booking.sorobanBookingId ?? null,
      };
    }

    return {
      outcome: "confirmed",
      changed: true,
      fromStatus,
      toStatus: "confirmed",
      onChainBookingId,
    };
  }

  if (transactionStatus.status === "failed") {
    const reason = transactionStatus.error || "Transaction failed";

    if (fromStatus === "failed") {
      // Idempotent replay — never overwrite an existing failure record.
      return {
        outcome: "failed",
        changed: false,
        fromStatus,
        toStatus: "failed",
        reason: booking.lastError ?? reason,
      };
    }

    return {
      outcome: "failed",
      changed: true,
      fromStatus,
      toStatus: "failed",
      reason,
    };
  }

  // 'pending' | 'not_found' — nothing to persist; callers keep polling.
  return {
    outcome: "left_pending",
    changed: false,
    fromStatus,
    toStatus: fromStatus,
  };
}

export interface ConfirmBookingTxResult {
  outcome: ConfirmOutcome;
  changed: boolean;
  booking: Booking;
  transactionStatus: TransactionStatus | null;
}

/**
 * Read the Soroban transaction status for a booking and apply the idempotent
 * confirm transition, persisting only when something actually changed.
 */
export async function confirmBookingTx(
  bookingId: string,
): Promise<ConfirmBookingTxResult> {
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({
    where: { id: bookingId },
    relations: ["flight"],
  });
  if (!booking) {
    throw new BadRequestError("Booking not found");
  }

  if (!booking.sorobanTxHash) {
    return {
      outcome: "left_pending",
      changed: false,
      booking,
      transactionStatus: null,
    };
  }

  const transactionStatus = await withRetries(
    () => getTransactionStatus(booking.sorobanTxHash as string),
    { maxAttempts: 3, delayMs: 200, operationName: "confirmBookingTx:getTransactionStatus" },
  );

  const decision = applyConfirmTransition({
    booking: {
      status: booking.status,
      sorobanBookingId: booking.sorobanBookingId ?? null,
      lastError: booking.lastError ?? undefined,
    },
    transactionStatus,
  });

  if (decision.changed) {
    booking.status = decision.toStatus;
    if (decision.outcome === "confirmed" && decision.onChainBookingId) {
      booking.sorobanBookingId = decision.onChainBookingId;
    }
    if (decision.outcome === "failed" && decision.reason) {
      booking.lastError = decision.reason;
    }
    await bookingRepo.save(booking);
    logger.info("Booking confirm transition applied (#784)", {
      bookingId,
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
      outcome: decision.outcome,
    });
  }

  return {
    outcome: decision.outcome,
    changed: decision.changed,
    booking,
    transactionStatus,
  };
}
