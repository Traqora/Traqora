import { z } from 'zod';

export const configSchema = z.object({
  port: z.number().default(3001),
  environment: z.enum(['development', 'staging', 'production']).default('development'),
  corsOrigin: z.string().url().default('http://localhost:3000'),

  stellarNetwork: z.enum(['production', 'testnet', 'standalone']).default('testnet'),
  stellarSecretKey: z.string().optional(),
  horizonUrl: z.string().url(),
  sorobanRpcUrl: z.string().url(),

  contracts: z.object({
    booking: z.string().min(1, "Booking contract ID is required"),
    airline: z.string().min(1, "Airline contract ID is required"),
    refund: z.string().min(1, "Refund contract ID is required"),
    loyalty: z.string().min(1, "Loyalty contract ID is required"),
    governance: z.string().min(1, "Governance contract ID is required"),
    token: z.string().min(1, "Token contract ID is required"),
    flightRegistry: z.string().min(1, "Flight registry contract ID is required"),
  }),

  databaseUrl: z.string().min(1, "Database URL is required"),
  redisUrl: z.string().min(1, "Redis URL is required"),
  mongoUrl: z.string().optional(),

  jwtSecret: z.string().min(32, "JWT secret must be at least 32 characters"),
  jwtExpiresIn: z.string().default('1h'),
  jwtRefreshSecret: z.string().min(32, "JWT refresh secret must be at least 32 characters"),
  jwtRefreshExpiresIn: z.string().default('7d'),
  
  adminApiKey: z.string().min(16, "Admin API key must be at least 16 characters"),

  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  auditLogEnabled: z.boolean().default(false),
});

export type Config = z.infer<typeof configSchema>;
