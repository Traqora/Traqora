// @ts-ignore
import { z } from 'zod';

// Authentication schemas
export const challengeSchema = z.object({
  walletAddress: z.string().min(56).max(56).startsWith('G'),
});

export const verifySchema = z.object({
  walletAddress: z.string().min(56).max(56).startsWith('G'),
  signature: z.string().min(1),
  walletType: z.enum(['freighter', 'albedo', 'rabet']),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Booking schemas
export const passengerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(4).optional(),
  sorobanAddress: z.string().min(1),
});

export const createBookingSchema = z.object({
  flightId: z.string().uuid(),
  passenger: passengerSchema,
});

// Refund schemas
export const createRefundSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.enum([
    'flight_cancelled',
    'flight_delayed',
    'customer_request',
    'duplicate_booking',
    'service_issue',
    'other',
  ]),
  reasonDetails: z.string().optional(),
  requestedBy: z.string().optional(),
});

export const manualReviewSchema = z.object({
  approved: z.boolean(),
  reviewedBy: z.string().min(1),
  reviewNotes: z.string().min(1),
  customRefundPercentage: z.number().min(0).max(100).optional(),
});

export const submitOnchainSchema = z.object({
  signedXdr: z.string().min(1),
});

// Additional schemas for other routes
// TODO: Add schemas from airlines.ts, flights.ts, governance.ts, loyalty.ts, metrics.ts, security.ts, subscriptions.ts, users.ts, wallet.ts
