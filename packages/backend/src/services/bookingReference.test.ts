import {
  BOOKING_REFERENCE_BODY_LENGTH,
  BOOKING_REFERENCE_PREFIX,
  buildBookingMemo,
  bookingReferenceForBookingId,
  encodeCrockfordBase32,
  generateBookingReference,
  isValidBookingReference,
  STELLAR_MEMO_TEXT_MAX_BYTES,
} from './bookingReference';

describe('booking reference memos (#924)', () => {
  const SECRET = 'test-booking-memo-secret-at-least-16';

  it('produces a stable, privacy-safe reference for the same seed', () => {
    const first = generateBookingReference('booking:123', SECRET);
    const second = generateBookingReference('booking:123', SECRET);

    expect(first).toBe(second);
    expect(first).toMatch(new RegExp(`^${BOOKING_REFERENCE_PREFIX}[0-9A-HJKMNP-TV-Z]{16}$`));
    expect(first).not.toContain('123');
  });

  it('produces a different reference for a different seed or secret', () => {
    const a = generateBookingReferenceAt('seed-a');
    const b = generateBookingReferenceAt('seed-b');
    const c = generateBookingReferenceAt('seed-a', 'another-booking-secret-at-least-16');

    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('is collision-resistant across many booking ids', () => {
    const references = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      references.add(bookingReferenceForBookingId(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, SECRET));
    }
    expect(references.size).toBe(2000);
  });

  it('fits within the Stellar MEMO_TEXT limit', () => {
    const reference = generateBookingReference('seed', SECRET);
    expect(Buffer.byteLength(reference, 'utf8')).toBeLessThanOrEqual(STELLAR_MEMO_TEXT_MAX_BYTES);
    expect(buildBookingMemo(reference).value).toBe(reference);
  });

  it('rejects empty seeds and missing secrets', () => {
    expect(() => generateBookingReference('', SECRET)).toThrow(/seed/i);
    expect(() => generateBookingReference('seed', '')).toThrow(/secret/i);
  });

  it('rejects oversize and non-ASCII memos before building a transaction', () => {
    expect(() => buildBookingMemo('X'.repeat(STELLAR_MEMO_TEXT_MAX_BYTES + 1))).toThrow(/at most 28/);
    expect(() => buildBookingMemo('TRQ-🚀')).toThrow(/printable ASCII/);
    expect(() => buildBookingMemo('')).toThrow(/must not be empty/);
  });

  it('validates reference format and bounds', () => {
    const reference = generateBookingReference('seed', SECRET);
    expect(isValidBookingReference(reference)).toBe(true);
    expect(isValidBookingReference('not-a-reference')).toBe(false);
    expect(isValidBookingReference(reference.toLowerCase())).toBe(false);
    expect(isValidBookingReference(`${reference}XXXX`)).toBe(false);
  });

  it('encodes Crockford base32 deterministically', () => {
    expect(encodeCrockfordBase32(Buffer.from([0x00]), 4)).toBe('0');
    expect(encodeCrockfordBase32(Buffer.from([0xff, 0xff]), 4)).toBe('ZZZ');
    expect(encodeCrockfordBase32(Buffer.from([0x00]), 0)).toBe('');
    expect(generateBookingReference('seed', SECRET)).toHaveLength(
      BOOKING_REFERENCE_PREFIX.length + BOOKING_REFERENCE_BODY_LENGTH,
    );
  });
});

function generateBookingReferenceAt(seed: string, secret = 'test-booking-memo-secret-at-least-16'): string {
  return generateBookingReference(seed, secret);
}
