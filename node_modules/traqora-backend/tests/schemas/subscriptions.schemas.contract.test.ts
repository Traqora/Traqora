// @ts-ignore
import { z } from 'zod';

// Schema from routes/subscriptions.ts
const createSubscriptionSchema = z.object({
  userId: z.string().min(1),
  flightId: z.string().min(1),
  targetPrice: z.number().positive(),
  currency: z.string().default('USD'),
  notificationMethod: z.enum(['email', 'push', 'both']).default('email'),
});

describe('Subscription Schema Contract Tests', () => {
  const validSubscription = {
    userId: 'user-123',
    flightId: 'flight-456',
    targetPrice: 250.50,
    currency: 'USD',
    notificationMethod: 'email',
  };

  it('should accept valid subscription with all fields', () => {
    const result = createSubscriptionSchema.safeParse(validSubscription);
    expect(result.success).toBe(true);
  });

  it('should apply default currency to USD', () => {
    const { currency, ...withoutCurrency } = validSubscription;
    const result = createSubscriptionSchema.safeParse(withoutCurrency);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
    }
  });

  it('should apply default notificationMethod to email', () => {
    const { notificationMethod, ...withoutMethod } = validSubscription;
    const result = createSubscriptionSchema.safeParse(withoutMethod);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notificationMethod).toBe('email');
    }
  });

  it('should accept all valid notificationMethod values', () => {
    const methods = ['email', 'push', 'both'] as const;
    methods.forEach((method) => {
      const result = createSubscriptionSchema.safeParse({
        ...validSubscription,
        notificationMethod: method,
      });
      expect(result.success).toBe(true);
    });
  });

  it('should reject empty userId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      userId: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing userId', () => {
    const { userId, ...withoutUserId } = validSubscription;
    const result = createSubscriptionSchema.safeParse(withoutUserId);
    expect(result.success).toBe(false);
  });

  it('should reject empty flightId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      flightId: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing flightId', () => {
    const { flightId, ...withoutFlightId } = validSubscription;
    const result = createSubscriptionSchema.safeParse(withoutFlightId);
    expect(result.success).toBe(false);
  });

  it('should reject targetPrice <= 0', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject negative targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: -100,
    });
    expect(result.success).toBe(false);
  });

  it('should accept positive targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: 100,
    });
    expect(result.success).toBe(true);
  });

  it('should accept decimal targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: 199.99,
    });
    expect(result.success).toBe(true);
  });

  it('should accept valid currency codes', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
    currencies.forEach((currency) => {
      const result = createSubscriptionSchema.safeParse({
        ...validSubscription,
        currency,
      });
      expect(result.success).toBe(true);
    });
  });

  it('should accept currency as any string', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      currency: 'BTC',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid notificationMethod', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      notificationMethod: 'sms',
    });
    expect(result.success).toBe(false);
  });

  it('should reject null userId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      userId: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject null flightId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      flightId: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject null targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: null,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-string userId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      userId: 123,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-string flightId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      flightId: 456,
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-number targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: '250',
    });
    expect(result.success).toBe(false);
  });

  it('should accept very high targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: 999999.99,
    });
    expect(result.success).toBe(true);
  });

  it('should accept very low positive targetPrice', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      targetPrice: 0.01,
    });
    expect(result.success).toBe(true);
  });

  it('should accept userId with special characters', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      userId: 'user-123_abc@test',
    });
    expect(result.success).toBe(true);
  });

  it('should accept flightId with special characters', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      flightId: 'FLIGHT-ABC_123',
    });
    expect(result.success).toBe(true);
  });

  it('should accept long userId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      userId: 'a'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it('should accept long flightId', () => {
    const result = createSubscriptionSchema.safeParse({
      ...validSubscription,
      flightId: 'a'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it('should accept minimal valid payload (required fields only)', () => {
    const minimalPayload = {
      userId: 'user-123',
      flightId: 'flight-456',
      targetPrice: 100,
    };
    const result = createSubscriptionSchema.safeParse(minimalPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe('USD');
      expect(result.data.notificationMethod).toBe('email');
    }
  });
});
