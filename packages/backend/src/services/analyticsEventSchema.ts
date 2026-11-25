import { z } from "zod";

const analyticsTimestampSchema = z
  .union([z.date(), z.string().datetime()])
  .transform((value) => (value instanceof Date ? value : new Date(value)));

/** Runtime schemas for data entering analytics storage or broadcast pipelines. */
export const recommendationAnalyticsEventSchema = z
  .object({
    userId: z.string().trim().min(1).max(128),
    destinationCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,8}$/),
    variant: z.enum(["personalized", "control"]),
    action: z.enum(["view", "click", "dismiss"]),
    reason: z.string().max(64).optional(),
  })
  .strict();

export const distributionAnalyticsEventSchema = z
  .object({
    distributionId: z.string().min(1).max(128),
    amount: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    timestamp: analyticsTimestampSchema,
  })
  .strict();

export const revenueAnalyticsEventSchema = z
  .object({
    bookingId: z.string().min(1).max(128),
    revenueCents: z.number().int().nonnegative(),
    delta: z.number().finite(),
    timestamp: analyticsTimestampSchema,
  })
  .strict();

export const analyticsAlertEventSchema = z
  .object({
    alertId: z.string().min(1).max(128),
    type: z.enum(["anomaly", "cost_threshold", "distribution_anomaly"]),
    severity: z.enum(["low", "medium", "high"]),
    message: z.string().min(1).max(1000),
    timestamp: analyticsTimestampSchema,
  })
  .strict();
