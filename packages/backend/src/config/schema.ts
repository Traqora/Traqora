import { z } from 'zod';

export const configSchema = z.object({
  port: z.number().default(3001),
  environment: z.enum(['development', 'staging', 'production', 'test']).default('development'),
  corsOrigin: z.string().url().default('http://localhost:3000'),
  trustProxy: z.boolean().default(false),

  stellarNetwork: z.enum(['production', 'mainnet', 'testnet', 'standalone']).default('testnet'),
  stellarSecretKey: z.string().optional().refine(
    (v) => !v || /^S[A-Z0-9]{55}$/.test(v),
    'Invalid Stellar secret key format'
  ),
  horizonUrl: z.string().url(),
  sorobanRpcUrl: z.string().url(),

  contracts: z.object({
    booking: z.string().min(1, "Booking contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Booking contract ID must not be the placeholder DEFAULT_ID'),
    airline: z.string().min(1, "Airline contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Airline contract ID must not be the placeholder DEFAULT_ID'),
    refund: z.string().min(1, "Refund contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Refund contract ID must not be the placeholder DEFAULT_ID'),
    loyalty: z.string().min(1, "Loyalty contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Loyalty contract ID must not be the placeholder DEFAULT_ID'),
    governance: z.string().min(1, "Governance contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Governance contract ID must not be the placeholder DEFAULT_ID'),
    token: z.string().min(1, "Token contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Token contract ID must not be the placeholder DEFAULT ID'),
    flightRegistry: z.string().min(1, "Flight registry contract ID is required").refine(v => v !== 'DEFAULT_ID', 'Flight registry contract ID must not be the placeholder DEFAULT_ID'),
  }),

  databaseUrl: z.string().min(1, "Database URL is required"),
  redisUrl: z.string().min(1, "Redis URL is required"),
  mongoUrl: z.string().optional(),

  jwtSecret: z.string().min(32, "JWT secret must be at least 32 characters"),
  jwtExpiresIn: z.string().regex(/^\d+[smhd]$/i, 'Must be a valid duration like 1h, 30m, 7d').default('1h'),
  jwtRefreshSecret: z.string().min(32, "JWT refresh secret must be at least 32 characters"),
  jwtRefreshExpiresIn: z.string().regex(/^\d+[smhd]$/i, 'Must be a valid duration like 1h, 30m, 7d').default('7d'),
  
  adminApiKey: z.string().min(12, "Admin API key must be at least 12 characters"),
  encryptionKey: z.string().min(32, "Encryption key must be at least 32 characters").default('dev-encryption-key-at-least-32-chars-long'),

  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  auditLogEnabled: z.boolean().default(false),
  nonceExpirySeconds: z.number().default(300),

  enableTracing: z.boolean().default(false),
  otelServiceName: z.string().min(1).default('traqora-backend'),
  otelServiceVersion: z.string().min(1).default('0.1.0'),
  otlpTraceUrl: z.string().url().default('http://localhost:4318/v1/traces'),
  otlpTraceHeaders: z.string().optional(),
  tracingSampleRate: z.number().min(0).max(1).default(1),

  rateLimitMax: z.number().int().positive().default(1000),
  rateLimitWindowSec: z.number().int().positive().default(60),
  rateLimitPublicMax: z.number().int().positive().default(100),
  rateLimitUserMax: z.number().int().positive().default(300),
  rateLimitPremiumMax: z.number().int().positive().default(1000),
  ddosBurstMax: z.number().int().positive().default(250),
  ddosBurstWindowSec: z.number().int().positive().default(60),
  rateLimitBlockDurationSec: z.number().int().positive().default(900),
  rateLimitBlockAfterViolations: z.number().int().positive().default(5),
  captchaAfterViolations: z.number().int().positive().default(3),
  useCloudflareHeaders: z.boolean().default(false),

  rateLimitFreePerMin: z.number().int().positive().default(100),
  rateLimitFreePerHr: z.number().int().positive().default(1000),
  rateLimitFreeBurst: z.number().int().positive().default(20),
  rateLimitProPerMin: z.number().int().positive().default(500),
  rateLimitProPerHr: z.number().int().positive().default(5000),
  rateLimitProBurst: z.number().int().positive().default(100),
  rateLimitEntPerMin: z.number().int().positive().default(2000),
  rateLimitEntPerHr: z.number().int().positive().default(20000),
  rateLimitEntBurst: z.number().int().positive().default(400),

  flightSearchCacheTtlSeconds: z.number().int().positive().default(300),
  flightRegistryCacheTtlSeconds: z.number().int().nonnegative().default(60),

  sendgridApiKey: z.string().optional(),
  firebaseServiceAccount: z.string().optional(),
  twilioAccountSid: z.string().optional(),
  twilioAuthToken: z.string().optional(),
  twilioPhoneNumber: z.string().optional(),

  stripeSecretKey: z.string().optional(),
  stripeWebhookSecret: z.string().optional(),

  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  baseUrl: z.string().url().optional(),
  timeout: z.number().int().positive().default(30000),

  frontendUrl: z.string().url().optional(),
  xlmUsdRate: z.number().positive().default(0.12),

  cspReportOnly: z.boolean().default(true),

  qualityScanCron: z.string().default('0 2 * * *'),
  archivalJobCron: z.string().default('0 3 * * *'),
});

export type Config = z.infer<typeof configSchema>;
