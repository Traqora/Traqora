import {
  isValidDeliveryTransition,
  sanitizeDeliveryMetadata,
  type DeliveryLifecycleState,
} from './deliveryLifecycle';

describe('delivery lifecycle state machine', () => {
  const valid: Array<[DeliveryLifecycleState | undefined, DeliveryLifecycleState]> = [
    [undefined, 'accepted'],
    [undefined, 'failed'],
    ['accepted', 'delivered'],
    ['accepted', 'failed'],
    ['failed', 'retrying'],
    ['failed', 'terminal'],
    ['retrying', 'accepted'],
    ['retrying', 'terminal'],
    ['delivered', 'terminal'],
  ];

  test.each(valid)('%s -> %s is allowed', (from, to) => {
    expect(isValidDeliveryTransition(from, to)).toBe(true);
  });

  const invalid: Array<[DeliveryLifecycleState | undefined, DeliveryLifecycleState]> = [
    [undefined, 'delivered'],
    [undefined, 'terminal'],
    ['terminal', 'accepted'],
    ['terminal', 'retrying'],
    ['delivered', 'retrying'],
    ['accepted', 'retrying'],
  ];

  test.each(invalid)('%s -> %s is rejected', (from, to) => {
    expect(isValidDeliveryTransition(from, to)).toBe(false);
  });

  test('repeating the current state is idempotent', () => {
    expect(isValidDeliveryTransition('accepted', 'accepted')).toBe(true);
  });
});

describe('sanitizeDeliveryMetadata', () => {
  test('redacts credential-like keys without mutating the input', () => {
    const input = {
      provider: 'sendgrid',
      apiKey: 'SG.secret',
      authorization: 'Bearer token',
      private_key: 'pem',
      webhookSignature: 'sig',
      externalId: 'msg-1',
    };

    const result = sanitizeDeliveryMetadata(input);

    expect(result.provider).toBe('sendgrid');
    expect(result.externalId).toBe('msg-1');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.authorization).toBe('[REDACTED]');
    expect(result.private_key).toBe('[REDACTED]');
    expect(result.webhookSignature).toBe('[REDACTED]');
    expect(input.apiKey).toBe('SG.secret');
  });

  test('redacts secrets inside nested objects and arrays', () => {
    const result = sanitizeDeliveryMetadata({
      attempts: [
        { provider: 'twilio', authToken: 'abc' },
        { provider: 'aws', password: 'def' },
      ],
      nested: { refreshToken: 'ghi', safe: 'value' },
    });

    expect(result.attempts).toEqual([
      { provider: 'twilio', authToken: '[REDACTED]' },
      { provider: 'aws', password: '[REDACTED]' },
    ]);
    expect(result.nested).toEqual({ refreshToken: '[REDACTED]', safe: 'value' });
  });

  test('returns an empty object for missing or non-object metadata', () => {
    expect(sanitizeDeliveryMetadata(undefined)).toEqual({});
    expect(sanitizeDeliveryMetadata(null)).toEqual({});
  });

  test('does not copy message body content into metadata', () => {
    const result = sanitizeDeliveryMetadata({ body: 'one-time link https://x/y' });
    expect(result.body).toBe('one-time link https://x/y');
    expect(Object.keys(result)).toEqual(['body']);
  });
});
