/**
 * Fluent test-data builders.
 * Usage:
 *   const booking = new BookingBuilder().withCryptoPayment().cancelled().build();
 */

import { createBooking, createFlight, createUser, createRefund, createDispute } from './factories';

// ─── BookingBuilder ──────────────────────────────────────────────────────────

export class BookingBuilder {
  private data: any;

  constructor() {
    this.data = createBooking();
  }

  forUser(userId: string): this {
    this.data.userId = userId;
    return this;
  }

  forFlight(flightId: string): this {
    this.data.flightId = flightId;
    return this;
  }

  withStripePayment(intentId?: string): this {
    this.data.paymentMethod = 'stripe';
    this.data.stripePaymentIntentId = intentId ?? `pi_test_${Date.now()}`;
    this.data.stellarTransactionHash = null;
    return this;
  }

  withCryptoPayment(hash?: string): this {
    this.data.paymentMethod = 'stellar';
    this.data.stellarTransactionHash = hash ?? `STELLAR_HASH_${Date.now()}`;
    this.data.stripePaymentIntentId = null;
    return this;
  }

  withContract(contractId: string): this {
    this.data.contractId = contractId;
    return this;
  }

  confirmed(): this {
    this.data.status = 'confirmed';
    return this;
  }

  pending(): this {
    this.data.status = 'pending';
    return this;
  }

  cancelled(): this {
    this.data.status = 'cancelled';
    return this;
  }

  refunded(): this {
    this.data.status = 'refunded';
    return this;
  }

  withAmount(amount: number, currency = 'USD'): this {
    this.data.totalAmount = amount;
    this.data.currency = currency;
    return this;
  }

  build(): any {
    return { ...this.data };
  }
}

// ─── FlightBuilder ───────────────────────────────────────────────────────────

export class FlightBuilder {
  private data: any;

  constructor() {
    this.data = createFlight();
  }

  from(origin: string): this {
    this.data.origin = origin;
    return this;
  }

  to(destination: string): this {
    this.data.destination = destination;
    return this;
  }

  departingIn(hours: number): this {
    this.data.departureTime = new Date(Date.now() + hours * 3600_000);
    return this;
  }

  withPrice(price: number): this {
    this.data.price = price;
    return this;
  }

  withSeats(count: number): this {
    this.data.availableSeats = count;
    return this;
  }

  soldOut(): this {
    this.data.availableSeats = 0;
    return this;
  }

  build(): any {
    return { ...this.data };
  }
}

// ─── UserBuilder ─────────────────────────────────────────────────────────────

export class UserBuilder {
  private data: any;

  constructor() {
    this.data = createUser();
  }

  withEmail(email: string): this {
    this.data.email = email;
    return this;
  }

  withWallet(address: string): this {
    this.data.walletAddress = address;
    return this;
  }

  withLoyaltyPoints(points: number): this {
    this.data.loyaltyPoints = points;
    return this;
  }

  build(): any {
    return { ...this.data };
  }
}

// ─── RefundBuilder ───────────────────────────────────────────────────────────

export class RefundBuilder {
  private data: any;

  constructor() {
    this.data = createRefund();
  }

  forBooking(bookingId: string): this {
    this.data.bookingId = bookingId;
    return this;
  }

  withAmount(amount: number): this {
    this.data.amount = amount;
    return this;
  }

  approved(): this {
    this.data.status = 'approved';
    return this;
  }

  rejected(): this {
    this.data.status = 'rejected';
    return this;
  }

  processed(): this {
    this.data.status = 'processed';
    this.data.processedAt = new Date();
    return this;
  }

  build(): any {
    return { ...this.data };
  }
}

// ─── DisputeBuilder ──────────────────────────────────────────────────────────

export class DisputeBuilder {
  private data: any;

  constructor() {
    this.data = createDispute();
  }

  forBooking(bookingId: string): this {
    this.data.bookingId = bookingId;
    return this;
  }

  withReason(reason: string): this {
    this.data.reason = reason;
    return this;
  }

  resolved(resolution: string): this {
    this.data.status = 'resolved';
    this.data.resolution = resolution;
    this.data.resolvedAt = new Date();
    return this;
  }

  build(): any {
    return { ...this.data };
  }
}
