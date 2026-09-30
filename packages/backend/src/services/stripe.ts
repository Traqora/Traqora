import Stripe from 'stripe';
import {
  CircuitBreaker,
  executeWithResilience,
  isTransientError,
} from './ErrorHandlingService';
import { config } from '../config';

let stripeInstance: Stripe | null = null;

export const getStripe = (): Stripe => {
  if (!stripeInstance) {
    stripeInstance = new Stripe(config.stripeSecretKey || '', {
      apiVersion: '2024-06-20',
    });
  }
  return stripeInstance;
};

export const stripeWebhookSecret = config.stripeWebhookSecret || '';

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
