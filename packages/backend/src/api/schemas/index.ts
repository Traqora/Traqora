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
export const passengerNameField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(100, `${label} must be 100 characters or fewer`)
    .regex(
      /^[A-Za-z '-]+$/,
      `${label} may only contain letters, spaces, hyphens, and apostrophes`,
    );

export const passengerSchema = z.object({
  email: z.string().email().max(256),
  firstName: passengerNameField('First name'),
  lastName: passengerNameField('Last name'),
  middleName: z.string().max(100).optional(),
  title: z.string().max(32).optional(),
  suffix: z.string().max(32).optional(),
  dateOfBirth: z.string().date().optional(),
  nationality: z.string().max(64).optional(),
  phone: z.string().min(4).max(32).optional(),
  sorobanAddress: z.string().trim().min(1).max(128),
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


