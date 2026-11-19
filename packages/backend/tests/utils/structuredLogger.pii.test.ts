/**
 * V1 privacy redaction coverage (issue #1182).
 *
 * The redaction helpers are the single source of truth for both loggers, so
 * these tests exercise the helper exports directly rather than a transport.
 */
import {
  REDACTED,
  isSensitiveKey,
  redactLogRecord,
  redactMessageText,
  redactValue,
  serializeError,
} from '../../src/utils/structuredLogger';

// A structurally valid Stellar secret seed (S + 55 base32 chars). Public
// addresses start with G and must never be redacted.
const STELLAR_SECRET = `S${'A'.repeat(55)}`;
const STELLAR_PUBLIC = `G${'A'.repeat(55)}`;

describe('V1 sensitive key detection (issue #1182)', () => {
  it.each([
    // credentials (existing coverage)
    'authorization',
    'x-api-key',
    'accessToken',
    'refreshToken',
    'clientSecret',
    // wallet secrets
    'mnemonic',
    'seedPhrase',
    'recoveryPhrase',
    'privateKey',
    'stellarSecretKey',
    // payment secrets
    'cardNumber',
    'cvv',
    'cvc',
    'iban',
    'bankAccount',
    // passenger identity
    'passportNumber',
    'nationalId',
    'dateOfBirth',
    'dob',
    'firstName',
    'lastName',
    'fullName',
    'passengerName',
    // contact details
    'email',
    'collaboratorEmail',
    'recipientEmail',
    'phone',
    'phoneNumber',
    'mobile',
    // recipient key (exact match)
    'to',
    ' TO ',
  ])('redacts the %s key', (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each([
    'userId',
    'flightNumber',
    'amountCents',
    'status',
    'event',
    'name', // campaign/check/alert names are operational, not passenger PII
    'correlationId',
    'walletAddress', // public G... address, not signing material
    'bookingReference',
    'timestamp',
  ])('keeps the %s key', (key) => {
    expect(isSensitiveKey(key)).toBe(false);
  });

  it('does not over-match on substrings of short fragments', () => {
    expect(isSensitiveKey('total')).toBe(false);
    expect(isSensitiveKey('tolerance')).toBe(false);
    expect(isSensitiveKey('cvvCount')).toBe(false);
    expect(isSensitiveKey('dobCheck')).toBe(false);
  });
});

describe('structured field redaction', () => {
  it('redacts PII fields at every nesting depth without mutating input', () => {
    const input = {
      userId: 'user-1',
      email: 'traveler@example.com',
      phone: '+2348012345678',
      passenger: {
        firstName: 'Ada',
        lastName: 'Okafor',
        passportNumber: 'A1234567',
        dateOfBirth: '1990-01-01',
      },
      payment: { cardNumber: '4111111111111111', cvv: '123' },
      wallet: { mnemonic: 'word word word', publicAddress: STELLAR_PUBLIC },
      deliveries: [{ to: 'ada@example.com', status: 'sent' }],
    };

    const result = redactValue(input) as Record<string, any>;

    expect(result.userId).toBe('user-1');
    expect(result.email).toBe(REDACTED);
    expect(result.phone).toBe(REDACTED);
    expect(result.passenger).toEqual({
      firstName: REDACTED,
      lastName: REDACTED,
      passportNumber: REDACTED,
      dateOfBirth: REDACTED,
    });
    expect(result.payment).toEqual({ cardNumber: REDACTED, cvv: REDACTED });
    expect(result.wallet).toEqual({ mnemonic: REDACTED, publicAddress: STELLAR_PUBLIC });
    expect(result.deliveries).toEqual([{ to: REDACTED, status: 'sent' }]);

    // input is untouched
    expect(input.email).toBe('traveler@example.com');
    expect(input.passenger.firstName).toBe('Ada');
  });
});

describe('in-string redaction (issue #1182)', () => {
  it('redacts email addresses inside free-text messages', () => {
    expect(redactMessageText('Invitation sent to ada@example.com for group g-1')).toBe(
      `Invitation sent to ${REDACTED} for group g-1`
    );
    expect(redactMessageText('Contact: first.last+tag@sub.example.co.uk')).toBe(
      `Contact: ${REDACTED}`
    );
  });

  it('redacts Stellar secret seeds but keeps public addresses', () => {
    expect(redactMessageText(`signing with ${STELLAR_SECRET} now`)).toContain(REDACTED);
    expect(redactMessageText(`signing with ${STELLAR_SECRET} now`)).not.toContain(STELLAR_SECRET);
    expect(redactMessageText(`monitoring ${STELLAR_PUBLIC}`)).toContain(STELLAR_PUBLIC);
  });

  it('leaves non-PII strings untouched', () => {
    expect(redactMessageText('Booking confirmed for TRQ-ABCDEFGHIJKLMNOP')).toBe(
      'Booking confirmed for TRQ-ABCDEFGHIJKLMNOP'
    );
    expect(redactMessageText('user@example')).toBe('user@example');
  });

  it('redacts strings reached through redactValue, including message fields', () => {
    const result = redactValue({
      message: 'Flight status shared with recipient@example.com',
      meta: { note: `seed ${STELLAR_SECRET}` },
    }) as Record<string, any>;

    expect(result.message).toContain(REDACTED);
    expect(result.message).not.toContain('recipient@example.com');
    expect(result.meta.note).toContain(REDACTED);
    expect(result.meta.note).not.toContain(STELLAR_SECRET);
  });

  it('redacts error messages that interpolate PII', () => {
    const serialized = serializeError(
      new Error(`No user found for email traveler@example.com`)
    );
    expect(serialized?.message).toContain(REDACTED);
    expect(serialized?.message).not.toContain('traveler@example.com');
  });

  it('redacts the stack and string cause of an error', () => {
    const error = new Error('failure for ops@example.com');
    error.stack = 'Error: failure for ops@example.com\n    at handler (/app/route.ts:1:1)';
    (error as Error & { cause?: unknown }).cause = 'caused by ops@example.com';

    const serialized = serializeError(error);
    expect(serialized?.stack).toContain(REDACTED);
    expect(serialized?.stack).not.toContain('ops@example.com');
    expect(serialized?.cause).toContain(REDACTED);
    expect(serialized?.cause).not.toContain('ops@example.com');
  });

  it('redacts the winston message symbol through redactLogRecord', () => {
    const messageSymbol = Symbol.for('message');
    const record = {
      level: 'info',
      message: 'raw',
      [messageSymbol]: 'Sent to traveler@example.com',
    };

    const result = redactLogRecord(record);
    expect(result[messageSymbol as keyof typeof result]).toContain(REDACTED);
    expect(result[messageSymbol as keyof typeof result]).not.toContain(
      'traveler@example.com'
    );
  });
});
