import Stripe from 'stripe';
import {
  CircuitBreaker,
  executeWithResilience,
  isTransientError,
} from './ErrorHandlingService';

const apiKey = process.env.STRIPE_SECRET_KEY || '';

export const stripe = new Stripe(apiKey, {
  apiVersion: '2024-06-20',
});

export const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

const stripeCircuitBreaker = new CircuitBreaker('stripe-api', {
  failureThreshold: 5,
  recoveryTimeoutMs: 30_000,
});

export const executeStripeOperation = async <T>(
  operationName: string,
  fn: () => Promise<T>,
  context: Record<string, unknown> = {}
): Promise<T> =>
  executeWithResilience(stripeCircuitBreaker, fn, {
    operationName,
    context,
    retry: {
      retries: 3,
      baseDelayMs: 300,
      shouldRetry: (error) => isTransientError(error),
    },
  });
