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

export const travelPreferencesSchema = z.object({
  seatPreference: z.enum(['aisle', 'window', 'middle']).optional(),
  mealPreference: z.string().max(100).optional(),
  preferredCabinClass: z.enum(['economy', 'premium_economy', 'business', 'first']).optional(),
  frequentFlyerNumbers: z.record(z.string(), z.string()).optional(),
});

export const userProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).nullable(),
    bio: z.string().trim().max(500).nullable(),
    avatarUrl: z.string().trim().url().max(2048).nullable(),
    travelPreferences: travelPreferencesSchema.nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

// GDPR consent schemas (#549). consentType mirrors
// db/entities/ConsentRecord.ts's ConsentType union exactly — kept as a
// literal enum here (not imported) since zod needs its own runtime enum
// value, but the two must be changed together.
export const consentGrantSchema = z.object({
  consentType: z.enum([
    'marketing',
    'analytics',
    'data_processing',
    'third_party_sharing',
    'profiling',
  ]),
  consentDetails: z.string().trim().min(1).max(2000),
  expiresAt: z.coerce.date().optional(),
});

export const consentWithdrawSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
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
