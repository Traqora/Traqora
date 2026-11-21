/**
 * Maps Soroban contract-level failures to typed backend errors (#547).
 *
 * Unlike a contract that declares a `#[contracterror]` enum with numeric
 * discriminants (checked directly against every `contracts/packages/*`
 * package in this repo — none of the 18 use one), every contract here
 * signals a domain failure via `assert!`/`.expect()`, which panics with a
 * plain human-readable string. That string is the only structured signal
 * available; there is no numeric code to decode. This mapper therefore
 * works by exact-matching the panic message text embedded in a Soroban RPC
 * `SimulateTransactionErrorResponse["error"]` string (typed `string` per
 * `@stellar/stellar-sdk`'s `rpc/api.d.ts`) against every known panic
 * message currently in `contracts/packages/booking/src/lib.rs` — the only
 * contract `services/soroban.ts` actually calls today.
 *
 * Caveat, same as this repo's earlier error-mapping work in
 * `stellarErrors.ts`: this was built from reading the panic call sites
 * directly, not from a captured live failing simulation (no funded network
 * account or local Soroban node was available in this session). The
 * standard Soroban host diagnostic format embeds a panicking `.expect()`/
 * `assert!` message in the simulation error string, but the *exact*
 * surrounding text has not been confirmed against a real failing call —
 * verify this against one before relying on it in production.
 *
 * A message not in this map (a different contract's failure, a host-level
 * trap, a network error) falls through to `undefined`, which
 * `stellarErrors.ts`'s existing generic "SOROBAN_SIMULATION_FAILED"
 * fallback already handles — this module only adds precision where it
 * can, it does not replace that fallback.
 */

export interface SorobanContractErrorMapping {
  code: string;
  message: string;
  /** HTTP status this failure should surface as — an already-processed booking is a 409, a missing one is a 404, an authorization failure is a 403, not a blanket 500. */
  statusCode: number;
}

/**
 * Keyed by the exact panic message string from
 * `contracts/packages/booking/src/lib.rs`. Every entry here must be
 * re-verified against that file if it changes — see the module doc
 * comment's refresh note.
 */
export const BOOKING_CONTRACT_ERRORS: Record<string, SorobanContractErrorMapping> = {
  'Booking not found': {
    code: 'BOOKING_NOT_FOUND',
    message: 'This booking does not exist on-chain.',
    statusCode: 404,
  },
  'Already paid or cancelled': {
    code: 'BOOKING_ALREADY_PAID_OR_CANCELLED',
    message: 'This booking has already been paid for or cancelled.',
    statusCode: 409,
  },
  'Invalid booking status': {
    code: 'BOOKING_INVALID_STATUS',
    message: 'This booking is not in a state that allows this action.',
    statusCode: 409,
  },
  'No funds in escrow': {
    code: 'BOOKING_NO_FUNDS_IN_ESCROW',
    message: 'There are no escrowed funds remaining for this booking.',
    statusCode: 409,
  },
  'Cancellation window closed': {
    code: 'BOOKING_CANCELLATION_WINDOW_CLOSED',
    message: 'This booking can no longer be cancelled — the cancellation window has closed.',
    statusCode: 409,
  },
  'Booking cannot be refunded': {
    code: 'BOOKING_NOT_REFUNDABLE',
    message: 'This booking is not eligible for a refund in its current state.',
    statusCode: 409,
  },
  'Invalid refund bps': {
    code: 'BOOKING_INVALID_REFUND_BPS',
    message: 'The requested refund percentage is invalid.',
    statusCode: 400,
  },
  'Booking cannot be cancelled': {
    code: 'BOOKING_NOT_CANCELLABLE',
    message: 'This booking is not eligible for cancellation in its current state.',
    statusCode: 409,
  },
  'Not authorized to cancel': {
    code: 'BOOKING_CANCEL_NOT_AUTHORIZED',
    message: 'You are not authorized to cancel this booking.',
    statusCode: 403,
  },
  'Empty batch': {
    code: 'BOOKING_EMPTY_BATCH',
    message: 'The batch operation was given no booking ids.',
    statusCode: 400,
  },
  'Batch too large': {
    code: 'BOOKING_BATCH_TOO_LARGE',
    message: 'The batch operation exceeds the maximum allowed batch size.',
    statusCode: 400,
  },
  'Oracle not configured': {
    code: 'BOOKING_ORACLE_NOT_CONFIGURED',
    message: 'No oracle is configured for this booking contract.',
    statusCode: 409,
  },
  'Unauthorized oracle': {
    code: 'BOOKING_UNAUTHORIZED_ORACLE',
    message: 'The calling address is not the configured trusted oracle.',
    statusCode: 403,
  },
};

/**
 * Extracts a Soroban contract panic message from a simulation/submission
 * error string and maps it to a typed error, or `undefined` if the string
 * doesn't contain a recognized message. Soroban's standard diagnostic
 * format surrounds a panic message with additional context (the
 * `HostError:` prefix, an `Error(Contract, ...)` or `UnreachableCodeReached`
 * wrapper, event log lines) — this checks for the panic message as a
 * substring rather than requiring an exact full-string match, since the
 * surrounding text is not guaranteed stable across SDK/host versions
 * (see the module doc comment's live-verification caveat).
 */
export function mapBookingContractError(errorMessage: string | undefined | null): SorobanContractErrorMapping | undefined {
  if (!errorMessage) return undefined;
  for (const [panicMessage, mapping] of Object.entries(BOOKING_CONTRACT_ERRORS)) {
    if (errorMessage.includes(panicMessage)) {
      return mapping;
    }
  }
  return undefined;
}
