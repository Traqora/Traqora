/**
 * Bounded on-chain confirmation retry worker (#1131).
 *
 * A booking that has a submitted transaction is retried until it settles. Each
 * attempt is persisted so retries survive a process restart: `attempts` grows,
 * `nextAttemptAt` enforces exponential backoff, and once the policy budget is
 * spent the booking moves to the visible terminal `failed` status with a
 * `lastError` explaining why. A definitive on-chain `failed` status is terminal
 * immediately and is never retried.
 */

import { AppDataSource } from "../db/dataSource";
import { Booking, BookingStatus } from "../db/entities/Booking";
import { Flight } from "../db/entities/Flight";
import { logger } from "../utils/logger";
import { getWebSocketServer } from "../websockets/server";
import {
  confirmBookingTx,
  ConfirmBookingTxResult,
  ConfirmOutcome,
} from "./bookingConfirmRetry";
import {
  bookingDeadLetterService,
  CaptureBookingDeadLetterInput,
} from "./bookingDeadLetterService";

export const CONFIRMATION_RETRY_STATUSES: readonly BookingStatus[] = [
  "onchain_pending",
  "onchain_submitted",
];

export interface ConfirmationRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}

const positiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

export const DEFAULT_CONFIRMATION_RETRY_POLICY: ConfirmationRetryPolicy = {
  maxAttempts: positiveInt(process.env.CONFIRMATION_RETRY_MAX_ATTEMPTS, 8),
  baseDelayMs: positiveInt(process.env.CONFIRMATION_RETRY_BASE_DELAY_MS, 5_000),
  maxDelayMs: positiveInt(process.env.CONFIRMATION_RETRY_MAX_DELAY_MS, 60_000),
  jitterRatio: 0.2,
};

const DEFAULT_BATCH_SIZE = positiveInt(process.env.CONFIRMATION_RETRY_BATCH_SIZE, 50);
const MAX_BATCH_SIZE = 500;

export type ConfirmationAttemptOutcome = ConfirmOutcome | "error";

export interface ConfirmationRetryDecision {
  outcome: ConfirmationAttemptOutcome;
  attempts: number;
  nextAttemptAt: Date | null;
  status: BookingStatus;
  lastError: string | null;
  terminal: boolean;
  settled: boolean;
}

export function computeConfirmationBackoff(
  attempt: number,
  policy: ConfirmationRetryPolicy = DEFAULT_CONFIRMATION_RETRY_POLICY,
  random: () => number = Math.random,
): number {
  const safeAttempt = Math.max(1, Math.trunc(attempt));
  const exponential = policy.baseDelayMs * Math.pow(2, safeAttempt - 1);
  const capped = Math.min(exponential, policy.maxDelayMs);
  const jitter = capped * policy.jitterRatio * random();
  return Math.min(Math.round(capped + jitter), policy.maxDelayMs);
}

export function decideConfirmationRetry(input: {
  currentAttempts: number;
  status: BookingStatus;
  outcome: ConfirmationAttemptOutcome;
  reason?: string;
  policy?: ConfirmationRetryPolicy;
  now?: Date;
  random?: () => number;
}): ConfirmationRetryDecision {
  const policy = input.policy ?? DEFAULT_CONFIRMATION_RETRY_POLICY;
  const now = input.now ?? new Date();
  const currentAttempts = Math.max(0, Math.trunc(input.currentAttempts));
  const attempts = currentAttempts + 1;

  if (input.outcome === "confirmed" || input.outcome === "already_confirmed") {
    return {
      outcome: input.outcome,
      attempts: 0,
      nextAttemptAt: null,
      status: "confirmed",
      lastError: null,
      terminal: false,
      settled: true,
    };
  }

  if (input.outcome === "failed") {
    return {
      outcome: input.outcome,
      attempts,
      nextAttemptAt: null,
      status: "failed",
      lastError: input.reason ?? "Transaction failed",
      terminal: true,
      settled: true,
    };
  }

  if (attempts >= policy.maxAttempts) {
    const suffix = input.reason ? `: ${input.reason}` : "";
    return {
      outcome: input.outcome,
      attempts,
      nextAttemptAt: null,
      status: "failed",
      lastError: `Confirmation retries exhausted after ${attempts} attempts${suffix}`,
      terminal: true,
      settled: true,
    };
  }

  return {
    outcome: input.outcome,
    attempts,
    nextAttemptAt: new Date(
      now.getTime() + computeConfirmationBackoff(attempts, policy, input.random),
    ),
    status: input.status,
    lastError: null,
    terminal: false,
    settled: false,
  };
}

export interface ConfirmationRetryRepository {
  findDue(now: Date, limit: number): Promise<Booking[]>;
  findById(id: string): Promise<Booking | null>;
  save(booking: Booking): Promise<Booking>;
}

export class TypeOrmConfirmationRetryRepository implements ConfirmationRetryRepository {
  constructor(private readonly dataSource = AppDataSource) {}

  async findDue(now: Date, limit: number): Promise<Booking[]> {
    return this.dataSource
      .getRepository(Booking)
      .createQueryBuilder("booking")
      .where("booking.status IN (:...statuses)", { statuses: CONFIRMATION_RETRY_STATUSES })
      .andWhere("booking.sorobanTxHash IS NOT NULL")
      .andWhere(
        "(booking.confirmationNextAttemptAt IS NULL OR booking.confirmationNextAttemptAt <= :now)",
        { now },
      )
      .orderBy("booking.confirmationNextAttemptAt", "ASC")
      .take(limit)
      .getMany();
  }

  async findById(id: string): Promise<Booking | null> {
    return this.dataSource.getRepository(Booking).findOne({
      where: { id },
      relations: ["flight"],
    });
  }

  async save(booking: Booking): Promise<Booking> {
    return this.dataSource.getRepository(Booking).save(booking);
  }
}

export interface ConfirmationRetryRunResult {
  bookingId: string;
  decision: ConfirmationRetryDecision;
  changed: boolean;
  skipped: boolean;
}

export interface ConfirmationRetryBatchSummary {
  scanned: number;
  attempted: number;
  confirmed: number;
  scheduled: number;
  failed: number;
  skipped: number;
}

export interface ConfirmationRetryServiceOptions {
  repository?: ConfirmationRetryRepository;
  confirm?: (bookingId: string) => Promise<ConfirmBookingTxResult>;
  policy?: ConfirmationRetryPolicy;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  broadcast?: (booking: Booking) => void;
  releaseSeat?: (booking: Booking) => Promise<void>;
  captureDeadLetter?: (
    input: CaptureBookingDeadLetterInput,
  ) => Promise<unknown> | void;
  random?: () => number;
  batchSize?: number;
}

const defaultBroadcast = (booking: Booking): void => {
  try {
    getWebSocketServer().broadcastBookingStatus(booking.id, booking.status);
  } catch (error) {
    logger.warn("Failed to broadcast booking status after confirmation retry", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

const defaultReleaseSeat = async (booking: Booking): Promise<void> => {
  if (!booking.flight?.id) return;
  await AppDataSource.getRepository(Flight).increment(
    { id: booking.flight.id },
    "seatsAvailable",
    1,
  );
};

const defaultCaptureDeadLetter = async (
  input: CaptureBookingDeadLetterInput,
): Promise<void> => {
  await bookingDeadLetterService.captureSafely(input);
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class ConfirmationRetryService {
  private readonly repository: ConfirmationRetryRepository;
  private readonly confirm: (bookingId: string) => Promise<ConfirmBookingTxResult>;
  private readonly policy: ConfirmationRetryPolicy;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly broadcast: (booking: Booking) => void;
  private readonly releaseSeat: (booking: Booking) => Promise<void>;
  private readonly captureDeadLetter: (
    input: CaptureBookingDeadLetterInput,
  ) => Promise<unknown> | void;
  private readonly random: () => number;
  private readonly batchSize: number;
  private readonly locks = new Map<string, Promise<void>>();

  constructor(options: ConfirmationRetryServiceOptions = {}) {
    this.repository = options.repository ?? new TypeOrmConfirmationRetryRepository();
    this.confirm = options.confirm ?? confirmBookingTx;
    this.policy = options.policy ?? DEFAULT_CONFIRMATION_RETRY_POLICY;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? defaultSleep;
    this.broadcast = options.broadcast ?? defaultBroadcast;
    this.releaseSeat = options.releaseSeat ?? defaultReleaseSeat;
    this.captureDeadLetter =
      options.captureDeadLetter ?? defaultCaptureDeadLetter;
    this.random = options.random ?? Math.random;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  }

  async processBooking(bookingId: string): Promise<ConfirmationRetryRunResult> {
    return this.withLock(bookingId, () => this.performAttempt(bookingId));
  }

  async runDueBatch(limit: number = this.batchSize): Promise<ConfirmationRetryBatchSummary> {
    const summary: ConfirmationRetryBatchSummary = {
      scanned: 0,
      attempted: 0,
      confirmed: 0,
      scheduled: 0,
      failed: 0,
      skipped: 0,
    };

    const due = await this.repository.findDue(
      this.now(),
      Math.min(MAX_BATCH_SIZE, Math.max(1, limit)),
    );
    summary.scanned = due.length;

    for (const booking of due) {
      try {
        const result = await this.processBooking(booking.id);
        if (result.skipped) {
          summary.skipped += 1;
          continue;
        }
        summary.attempted += 1;
        if (result.decision.status === "confirmed") {
          summary.confirmed += 1;
        } else if (result.decision.terminal) {
          summary.failed += 1;
        } else {
          summary.scheduled += 1;
        }
      } catch (error) {
        summary.failed += 1;
        logger.error("Confirmation retry worker failed to process booking", {
          bookingId: booking.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return summary;
  }

  async retryUntilSettled(
    bookingId: string,
  ): Promise<ConfirmationRetryRunResult | null> {
    const maxIterations = Math.max(1, this.policy.maxAttempts) + 1;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      const result = await this.processBooking(bookingId);
      if (result.skipped || result.decision.terminal) {
        return result;
      }

      const nextAttemptAt = result.decision.nextAttemptAt;
      if (!nextAttemptAt) {
        return result;
      }

      const delay = nextAttemptAt.getTime() - this.now().getTime();
      if (delay > 0) {
        await this.sleep(delay);
      }
    }

    return null;
  }

  private async performAttempt(bookingId: string): Promise<ConfirmationRetryRunResult> {
    const booking = await this.repository.findById(bookingId);
    if (
      !booking ||
      !booking.sorobanTxHash ||
      !CONFIRMATION_RETRY_STATUSES.includes(booking.status)
    ) {
      return this.skip(bookingId, booking);
    }

    let result: ConfirmBookingTxResult | null = null;
    let outcome: ConfirmationAttemptOutcome;
    let reason: string | undefined;
    const previousStatus = booking.status;

    try {
      result = await this.confirm(bookingId);
      outcome = result.outcome;
      reason = result.outcome === "failed" ? result.booking.lastError ?? undefined : undefined;
    } catch (error) {
      outcome = "error";
      reason = error instanceof Error ? error.message : String(error);
    }

    const decision = decideConfirmationRetry({
      currentAttempts: booking.confirmationAttempts ?? 0,
      status: booking.status,
      outcome,
      reason,
      policy: this.policy,
      now: this.now(),
      random: this.random,
    });

    const target = result?.booking ?? booking;
    target.confirmationAttempts = decision.attempts;
    target.confirmationNextAttemptAt = decision.nextAttemptAt;

    if (decision.status === "confirmed") {
      target.status = "confirmed";
      target.lastError = null;
    } else if (decision.terminal) {
      target.status = "failed";
      target.lastError = decision.lastError;
    }

    await this.repository.save(target);

    if (decision.status === "failed" && previousStatus !== "failed") {
      try {
        await this.captureDeadLetter({
          booking: target,
          previousStatus,
          outcome: decision.outcome,
          attempts: decision.attempts,
          reason: target.lastError ?? decision.lastError,
        });
      } catch (error) {
        logger.warn("Failed to quarantine terminal booking confirmation work", {
          bookingId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (result?.changed && result.outcome === "failed") {
      try {
        await this.releaseSeat(target);
      } catch (error) {
        logger.warn("Failed to release seat after on-chain confirmation failure", {
          bookingId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const changed =
      Boolean(result?.changed) || (decision.terminal && previousStatus !== "failed");
    if (changed) {
      this.broadcast(target);
    }

    logger.info("Confirmation retry attempt recorded (#1131)", {
      bookingId,
      outcome: decision.outcome,
      attempts: decision.attempts,
      terminal: decision.terminal,
      nextAttemptAt: decision.nextAttemptAt?.toISOString() ?? null,
    });

    return { bookingId, decision, changed, skipped: false };
  }

  private skip(bookingId: string, booking: Booking | null): ConfirmationRetryRunResult {
    const status = booking?.status ?? "failed";
    const outcome: ConfirmationAttemptOutcome =
      status === "confirmed" ? "already_confirmed" : status === "failed" ? "failed" : "left_pending";

    return {
      bookingId,
      decision: {
        outcome,
        attempts: booking?.confirmationAttempts ?? 0,
        nextAttemptAt: booking?.confirmationNextAttemptAt ?? null,
        status,
        lastError: booking?.lastError ?? null,
        terminal: status === "failed",
        settled: true,
      },
      changed: false,
      skipped: true,
    };
  }

  private async withLock<T>(bookingId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(bookingId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => current);
    this.locks.set(bookingId, queued);

    await previous;
    try {
      return await fn();
    } finally {
      release();
      if (this.locks.get(bookingId) === queued) {
        this.locks.delete(bookingId);
      }
    }
  }
}

export const confirmationRetryService = new ConfirmationRetryService();
