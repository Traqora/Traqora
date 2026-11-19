import { AppError } from './ErrorHandlingService';

/**
 * Checkout vs flight-offer expiry (#918).
 *
 * A checkout session stays actionable only until the earlier of its own
 * expiry and the upstream offer expiry. After that instant the session
 * must not create a reservation. The decision includes `refreshPath` so
 * the client can load a new offer and start checkout again.
 *
 * Failure: now >= actionableUntil, or either timestamp is unreadable.
 * That is OFFER_EXPIRED (HTTP 409). Retry by requesting a fresh offer
 * and submitting checkout with the new offerExpiresAt. Do not reuse the
 * expired session.
 */

export interface CheckoutExpiryInput {
  sessionExpiresAt: string | Date;
  offerExpiresAt: string | Date;
  now?: string | Date;
  refreshPath: string;
}

export interface CheckoutExpiryDecision {
  actionable: boolean;
  actionableUntil: string | null;
  offerExpiresAt: string | null;
  sessionExpiresAt: string | null;
  code: 'CHECKOUT_OPEN' | 'OFFER_EXPIRED';
  refreshPath: string;
  message: string;
}

export class OfferExpiredError extends AppError {
  constructor(decision: CheckoutExpiryDecision) {
    super(decision.message, {
      statusCode: 409,
      code: 'OFFER_EXPIRED',
      details: decision,
    });
    this.name = 'OfferExpiredError';
  }
}

function toDate(value: string | Date | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function resolveCheckoutExpiry(input: CheckoutExpiryInput): CheckoutExpiryDecision {
  const session = toDate(input.sessionExpiresAt);
  const offer = toDate(input.offerExpiresAt);
  const now = toDate(input.now) ?? new Date();

  if (!session || !offer) {
    return {
      actionable: false,
      actionableUntil: null,
      offerExpiresAt: offer ? offer.toISOString() : null,
      sessionExpiresAt: session ? session.toISOString() : null,
      code: 'OFFER_EXPIRED',
      refreshPath: input.refreshPath,
      message:
        'Checkout expiry could not be read. Refresh the flight offer and start checkout again.',
    };
  }

  const until = new Date(Math.min(session.getTime(), offer.getTime()));
  const actionable = now.getTime() < until.getTime();
  return {
    actionable,
    actionableUntil: until.toISOString(),
    offerExpiresAt: offer.toISOString(),
    sessionExpiresAt: session.toISOString(),
    code: actionable ? 'CHECKOUT_OPEN' : 'OFFER_EXPIRED',
    refreshPath: input.refreshPath,
    message: actionable
      ? 'Checkout stays open until the earlier of the session expiry and the flight-offer expiry.'
      : 'This checkout is no longer actionable because the flight offer expired. Refresh the offer and start checkout again.',
  };
}

export function assertCheckoutActionable(input: CheckoutExpiryInput): CheckoutExpiryDecision {
  const decision = resolveCheckoutExpiry(input);
  if (!decision.actionable) throw new OfferExpiredError(decision);
  return decision;
}
