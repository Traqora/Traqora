/**
 * Stable booking reference memos (#924).
 *
 * Contract
 * --------
 * Inputs : a stable seed (the booking UUID once assigned) and a secret.
 * Outputs: an ASCII reference of the form `TRQ-XXXXXXXXXXXXXXXX` (20 bytes),
 *          well under Stellar's 28-byte MEMO_TEXT limit, derived with
 *          HMAC-SHA256 so the raw booking id never appears on-chain.
 *
 * Properties:
 *   - deterministic: the same seed always produces the same reference, so
 *     retries and fee-bump rebuilding reuse the original memo;
 *   - privacy-safe: only a keyed digest is published;
 *   - collision-resistant: 16 Crockford base32 characters = 80 bits;
 *   - network-agnostic: the memo itself carries no network identifier.
 *
 * Error cases: empty seeds, missing secrets, non-ASCII references, and
 * references larger than the ledger memo limit are rejected before a
 * transaction is built.
 */

import crypto from 'crypto';
import { Memo } from '@stellar/stellar-sdk';

export const BOOKING_REFERENCE_PREFIX = 'TRQ-';
export const BOOKING_REFERENCE_BODY_LENGTH = 16;
export const STELLAR_MEMO_TEXT_MAX_BYTES = 28;

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_PATTERN = /^TRQ-[0-9A-HJKMNP-TV-Z]{16}$/;

/** Encode the high bits of a digest using Crockford base32 (no padding). */
export function encodeCrockfordBase32(buffer: Buffer, length: number): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5 && output.length < length) {
      bits -= 5;
      output += CROCKFORD_ALPHABET[(value >>> bits) & 0x1f];
    }

    if (output.length >= length) break;
  }

  return output;
}

export function generateBookingReference(seed: string, secret: string): string {
  if (!seed || seed.trim().length === 0) {
    throw new Error('A non-empty booking reference seed is required');
  }
  if (!secret || secret.length === 0) {
    throw new Error('A booking reference secret is required');
  }

  const digest = crypto
    .createHmac('sha256', secret)
    .update(`traqora:booking-reference:v1:${seed}`)
    .digest();

  return (
    BOOKING_REFERENCE_PREFIX +
    encodeCrockfordBase32(digest, BOOKING_REFERENCE_BODY_LENGTH)
  );
}

export function isValidBookingReference(reference: string): boolean {
  return (
    REFERENCE_PATTERN.test(reference) &&
    Buffer.byteLength(reference, 'utf8') <= STELLAR_MEMO_TEXT_MAX_BYTES
  );
}

/**
 * Validate a reference and turn it into a MEMO_TEXT. Throws before a
 * transaction is built if the memo would exceed the ledger limit.
 */
export function buildBookingMemo(reference: string): Memo {
  if (!reference) {
    throw new Error('Booking reference memo must not be empty');
  }
  if (!/^[\x20-\x7E]+$/.test(reference)) {
    throw new Error('Booking reference memo must contain printable ASCII only');
  }

  const byteLength = Buffer.byteLength(reference, 'utf8');
  if (byteLength > STELLAR_MEMO_TEXT_MAX_BYTES) {
    throw new Error(
      `Booking reference memo is ${byteLength} bytes; Stellar MEMO_TEXT allows at most ${STELLAR_MEMO_TEXT_MAX_BYTES}`,
    );
  }

  return Memo.text(reference);
}

/** Derive a booking reference from the booking id using the configured secret. */
export function bookingReferenceForBookingId(bookingId: string, secret: string): string {
  return generateBookingReference(`booking:${bookingId}`, secret);
}
