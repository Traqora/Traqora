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

export const userPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
  pushEnabled: z.boolean(),
});

export const createAirlineSchema = z.object({
  airlineCode: z.string().min(2).max(10),
  airlineName: z.string().min(1),
  airlineSorobanAddress: z.string().min(1).optional(),
});

export const walletVerifySchema = z.object({
  walletAddress: z.string().min(56).max(56).startsWith('G'),
  walletType: z.enum(['freighter', 'albedo', 'rabet']),
});

export const loyaltyActionSchema = z.object({
  points: z.number().int().min(1),
});

export const loyaltyTierSchema = z.object({
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']),
});
