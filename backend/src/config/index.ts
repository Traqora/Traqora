import { configSchema, Config } from './schema';
import { SecretManager } from '../services/secret-manager.service';
import { logger } from '../utils/logger';

let validatedConfig: Config;

export async function loadConfig(): Promise<Config> {
  const secretManager = SecretManager.getInstance();

  const env = await secretManager.getSecret('NODE_ENV', 'development');
  const isProdOrStaging = env === 'production' || env === 'staging';

  // For production/staging, do not provide insecure defaults for critical security secrets.
  const jwtSecretDefault = isProdOrStaging ? undefined : 'your-secret-key-change-in-production-at-least-32-chars';
  const jwtRefreshSecretDefault = isProdOrStaging ? undefined : 'your-refresh-secret-change-in-production-at-least-32-chars';
  const adminApiKeyDefault = isProdOrStaging ? undefined : 'dev-admin-key-at-least-16-chars';
  const encryptionKeyDefault = isProdOrStaging ? undefined : 'dev-encryption-key-at-least-32-chars-long';

  let jwtSecret: string;
  let jwtRefreshSecret: string;
  let adminApiKey: string;
  let encryptionKey: string;

  try {
    jwtSecret = await secretManager.getSecret('JWT_SECRET', jwtSecretDefault);
    jwtRefreshSecret = await secretManager.getSecret('JWT_REFRESH_SECRET', jwtRefreshSecretDefault);
    adminApiKey = await secretManager.getSecret('ADMIN_API_KEY', adminApiKeyDefault);
    encryptionKey = await secretManager.getSecret('ENCRYPTION_KEY', encryptionKeyDefault);
  } catch (error) {
    logger.error('CRITICAL CONFIGURATION ERROR: Required production/staging secrets are missing!', error as Error);
    if (isProdOrStaging) {
      process.exit(1);
    }
    throw error;
  }

  // Reject insecure/dev default credentials in production/staging environments
  if (isProdOrStaging) {
    const insecureKeywords = [
      'change-in-production',
      'your-secret',
      'your-refresh',
      'dev-secret',
      'dev-admin',
      'dev-encryption',
      'test-secret'
    ];

    const checkInsecure = (name: string, value: string) => {
      const lower = value.toLowerCase();
      for (const keyword of insecureKeywords) {
        if (lower.includes(keyword.toLowerCase())) {
          logger.error(`CRITICAL CONFIGURATION ERROR: Insecure default or keyword "${keyword}" detected in production secret ${name}!`);
          process.exit(1);
        }
      }
    };

    checkInsecure('JWT_SECRET', jwtSecret);
    checkInsecure('JWT_REFRESH_SECRET', jwtRefreshSecret);
    checkInsecure('ADMIN_API_KEY', adminApiKey);
    checkInsecure('ENCRYPTION_KEY', encryptionKey);
  }

  const rawConfig = {
    port: Number.parseInt(await secretManager.getSecret('PORT', '3001'), 10),
    environment: env,
    corsOrigin: await secretManager.getSecret('CORS_ORIGIN', 'http://localhost:3000'),

    stellarNetwork: await secretManager.getSecret('STELLAR_NETWORK', 'testnet'),
    stellarSecretKey: await secretManager.getSecret('STELLAR_SECRET_KEY', 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
    horizonUrl: await secretManager.getSecret('HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    sorobanRpcUrl: await secretManager.getSecret('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),

    contracts: {
      booking: await secretManager.getSecret('BOOKING_CONTRACT_ID', ''),
      airline: await secretManager.getSecret('AIRLINE_CONTRACT_ID', ''),
      refund: await secretManager.getSecret('REFUND_CONTRACT_ID', ''),
      loyalty: await secretManager.getSecret('LOYALTY_CONTRACT_ID', ''),
      governance: await secretManager.getSecret('GOVERNANCE_CONTRACT_ID', ''),
      token: await secretManager.getSecret('TOKEN_CONTRACT_ID', ''),
      flightRegistry: await secretManager.getSecret('FLIGHT_REGISTRY_CONTRACT_ID', ''),
    },

    databaseUrl: await secretManager.getSecret('DATABASE_URL', ''),
    redisUrl: await secretManager.getSecret('REDIS_URL', ''),
    mongoUrl: await secretManager.getSecret('MONGO_URI', ''),

    jwtSecret,
    jwtExpiresIn: await secretManager.getSecret('JWT_EXPIRES_IN', '1h'),
    jwtRefreshSecret,
    jwtRefreshExpiresIn: await secretManager.getSecret('JWT_REFRESH_EXPIRES_IN', '7d'),
    nonceExpirySeconds: Number.parseInt(await secretManager.getSecret('NONCE_EXPIRY_SECONDS', '300'), 10),

    adminApiKey,

    rateLimitWindowSec: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_WINDOW_SEC', '60'), 10),
    rateLimitMax: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_MAX', '100'), 10),
    rateLimitPublicMax: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_PUBLIC_MAX', '60'), 10),
    rateLimitUserMax: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_USER_MAX', '120'), 10),
    rateLimitPremiumMax: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_PREMIUM_MAX', '300'), 10),
    ddosBurstMax: Number.parseInt(await secretManager.getSecret('DDOS_BURST_MAX', '25'), 10),
    ddosBurstWindowSec: Number.parseInt(await secretManager.getSecret('DDOS_BURST_WINDOW_SEC', '3'), 10),
    rateLimitBlockDurationSec: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_BLOCK_DURATION_SEC', '900'), 10),
    rateLimitBlockAfterViolations: Number.parseInt(await secretManager.getSecret('RATE_LIMIT_BLOCK_AFTER_VIOLATIONS', '8'), 10),
    captchaAfterViolations: Number.parseInt(await secretManager.getSecret('CAPTCHA_AFTER_VIOLATIONS', '3'), 10),
    trustProxy: (await secretManager.getSecret('TRUST_PROXY', 'false')) === 'true',
    useCloudflareHeaders: (await secretManager.getSecret('USE_CLOUDFLARE_HEADERS', 'false')) === 'true',

    flightSearchCacheTtlSeconds: Number.parseInt(await secretManager.getSecret('FLIGHT_SEARCH_CACHE_TTL_SECONDS', '300'), 10),

    logLevel: await secretManager.getSecret('LOG_LEVEL', 'info'),
    auditLogEnabled: (await secretManager.getSecret('AUDIT_LOG_ENABLED', 'false')) === 'true',
    encryptionKey,
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.format();
    logger.error('Invalid configuration detected:', new Error(JSON.stringify(errors, null, 2)));
    
    if (isProdOrStaging) {
      logger.error('CRITICAL: Production/staging environment started with invalid configuration. Terminating process.');
      process.exit(1);
    }
    
    logger.warn('Continuing in development mode with schema warnings...');
    validatedConfig = rawConfig as any as Config;
  } else {
    validatedConfig = result.data;
    logger.info(`Configuration loaded successfully for environment: ${validatedConfig.environment}`);
  }

  // Check secret rotation for JWT
  if (validatedConfig.environment === 'production') {
    await secretManager.checkSecretRotation('JWT_SECRET', 90);
  }

  return validatedConfig;
}

// Export a getter for the config to ensure it's loaded
export const getConfig = (): Config => {
  if (!validatedConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return validatedConfig;
};

// Fallback configuration object for import-time access (e.g. logger.ts)
const fallbackConfig = {
  port: Number.parseInt(process.env.PORT || '3001', 10),
  environment: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
  stellarSecretKey: process.env.STELLAR_SECRET_KEY || 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',

  contracts: {
    booking: process.env.BOOKING_CONTRACT_ID || '',
    airline: process.env.AIRLINE_CONTRACT_ID || '',
    refund: process.env.REFUND_CONTRACT_ID || '',
    loyalty: process.env.LOYALTY_CONTRACT_ID || '',
    governance: process.env.GOVERNANCE_CONTRACT_ID || '',
    token: process.env.TOKEN_CONTRACT_ID || '',
    flightRegistry: process.env.FLIGHT_REGISTRY_CONTRACT_ID || '',
  },

  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  mongoUrl: process.env.MONGO_URI || '',

  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production-at-least-32-chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production-at-least-32-chars',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  nonceExpirySeconds: Number.parseInt(process.env.NONCE_EXPIRY_SECONDS || '300', 10),

  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key-at-least-16-chars',

  rateLimitWindowSec: Number.parseInt(process.env.RATE_LIMIT_WINDOW_SEC || '60', 10),
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  rateLimitPublicMax: Number.parseInt(process.env.RATE_LIMIT_PUBLIC_MAX || '60', 10),
  rateLimitUserMax: Number.parseInt(process.env.RATE_LIMIT_USER_MAX || '120', 10),
  rateLimitPremiumMax: Number.parseInt(process.env.RATE_LIMIT_PREMIUM_MAX || '300', 10),
  ddosBurstMax: Number.parseInt(process.env.DDOS_BURST_MAX || '25', 10),
  ddosBurstWindowSec: Number.parseInt(process.env.DDOS_BURST_WINDOW_SEC || '3', 10),
  rateLimitBlockDurationSec: Number.parseInt(process.env.RATE_LIMIT_BLOCK_DURATION_SEC || '900', 10),
  rateLimitBlockAfterViolations: Number.parseInt(process.env.RATE_LIMIT_BLOCK_AFTER_VIOLATIONS || '8', 10),
  captchaAfterViolations: Number.parseInt(process.env.CAPTCHA_AFTER_VIOLATIONS || '3', 10),
  trustProxy: process.env.TRUST_PROXY === 'true',
  useCloudflareHeaders: process.env.USE_CLOUDFLARE_HEADERS === 'true',

  flightSearchCacheTtlSeconds: Number.parseInt(process.env.FLIGHT_SEARCH_CACHE_TTL_SECONDS || '300', 10),

  logLevel: process.env.LOG_LEVEL || 'info',
  auditLogEnabled: process.env.AUDIT_LOG_ENABLED === 'true',
  encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-at-least-32-chars-long',
};

// Legacy support for direct config export - wrapped in Proxy for dynamic updates after loadConfig
export const config = new Proxy({} as Config, {
  get(target, prop) {
    if (validatedConfig) {
      return (validatedConfig as any)[prop];
    }
    return (fallbackConfig as any)[prop];
  }
});
