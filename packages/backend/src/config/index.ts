import { configSchema, Config } from './schema';
import { SecretManager } from '../services/secret-manager.service';
import { logger } from '../utils/logger';

let activeConfig: Config | null = null;

const parseBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  return Math.trunc(parseNumber(value, fallback));
};

const readConfigFromEnv = () => {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
    || (process.env.OTEL_EXPORTER_OTLP_ENDPOINT
      ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '')}/v1/traces`
      : undefined);

  return {
    port: parseInteger(process.env.PORT, 3001),
    environment: nodeEnv,
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    trustProxy: parseBool(process.env.TRUST_PROXY, false),

    stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
    stellarSecretKey: process.env.STELLAR_SECRET_KEY,
    horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
    sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',

    contracts: {
      booking: process.env.BOOKING_CONTRACT_ID || 'DEFAULT_ID',
      airline: process.env.AIRLINE_CONTRACT_ID || 'DEFAULT_ID',
      refund: process.env.REFUND_CONTRACT_ID || 'DEFAULT_ID',
      loyalty: process.env.LOYALTY_CONTRACT_ID || 'DEFAULT_ID',
      governance: process.env.GOVERNANCE_CONTRACT_ID || 'DEFAULT_ID',
      token: process.env.TOKEN_CONTRACT_ID || 'DEFAULT_ID',
      flightRegistry: process.env.FLIGHT_REGISTRY_CONTRACT_ID || 'DEFAULT_ID',
    },

    databaseUrl: process.env.DATABASE_URL || 'sqlite::memory:',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    mongoUrl: process.env.MONGO_URI,

    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production-at-least-32-chars',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-change-in-production-at-least-32-chars',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

    adminApiKey: process.env.ADMIN_API_KEY || (nodeEnv === 'test' ? 'dev-admin-key' : 'dev-admin-key-at-least-16-chars'),
    encryptionKey: process.env.ENCRYPTION_KEY || 'dev-encryption-key-at-least-32-chars-long',

    logLevel: process.env.LOG_LEVEL || 'info',
    auditLogEnabled: parseBool(process.env.AUDIT_LOG_ENABLED, false),
    nonceExpirySeconds: parseInteger(process.env.NONCE_EXPIRY_SECONDS, 300),

    enableTracing: parseBool(process.env.ENABLE_TRACING, false) || process.env.OTEL_SDK_DISABLED === 'false',
    otelServiceName: process.env.OTEL_SERVICE_NAME || 'traqora-backend',
    otelServiceVersion: process.env.OTEL_SERVICE_VERSION || process.env.npm_package_version || '0.1.0',
    otlpTraceUrl: process.env.OTLP_TRACE_URL || otlpEndpoint || 'http://localhost:4318/v1/traces',
    otlpTraceHeaders: process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS || process.env.OTEL_EXPORTER_OTLP_HEADERS,
    tracingSampleRate: parseNumber(process.env.OTEL_TRACES_SAMPLER_ARG || process.env.TRACING_SAMPLE_RATE, 1),

    rateLimitMax: parseInteger(process.env.RATE_LIMIT_MAX, 1000),
    rateLimitWindowSec: parseInteger(process.env.RATE_LIMIT_WINDOW_SEC, 60),
    rateLimitPublicMax: parseInteger(process.env.RATE_LIMIT_PUBLIC_MAX, 100),
    rateLimitUserMax: parseInteger(process.env.RATE_LIMIT_USER_MAX, 300),
    rateLimitPremiumMax: parseInteger(process.env.RATE_LIMIT_PREMIUM_MAX, 1000),
    ddosBurstMax: parseInteger(process.env.DDOS_BURST_MAX, 250),
    ddosBurstWindowSec: parseInteger(process.env.DDOS_BURST_WINDOW_SEC, 60),
    rateLimitBlockDurationSec: parseInteger(process.env.RATE_LIMIT_BLOCK_DURATION_SEC, 900),
    rateLimitBlockAfterViolations: parseInteger(process.env.RATE_LIMIT_BLOCK_AFTER_VIOLATIONS, 5),
    captchaAfterViolations: parseInteger(process.env.CAPTCHA_AFTER_VIOLATIONS, 3),
    useCloudflareHeaders: parseBool(process.env.USE_CLOUDFLARE_HEADERS, false),

    flightSearchCacheTtlSeconds: parseInteger(process.env.FLIGHT_SEARCH_CACHE_TTL_SECONDS, 300),
    flightRegistryCacheTtlSeconds: parseInteger(process.env.FLIGHT_REGISTRY_CACHE_TTL_SECONDS, 60),

    sendgridApiKey: process.env.SENDGRID_API_KEY,
    firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,

    clientId: process.env.AMADEUS_CLIENT_ID,
    clientSecret: process.env.AMADEUS_CLIENT_SECRET,
    baseUrl: process.env.AMADEUS_BASE_URL,
    timeout: parseInteger(process.env.AMADEUS_TIMEOUT_MS, 30000),
  };
};

export const loadConfig = async (): Promise<Config> => {
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
    port: parseInteger(await secretManager.getSecret('PORT', '3001'), 3001),
    environment: env,
    corsOrigin: await secretManager.getSecret('CORS_ORIGIN', 'http://localhost:3000'),
    trustProxy: (await secretManager.getSecret('TRUST_PROXY', 'false')) === 'true',

    stellarNetwork: await secretManager.getSecret('STELLAR_NETWORK', 'testnet'),
    stellarSecretKey: await secretManager.getSecret('STELLAR_SECRET_KEY', ''),
    horizonUrl: await secretManager.getSecret('HORIZON_URL', 'https://horizon-testnet.stellar.org'),
    sorobanRpcUrl: await secretManager.getSecret('SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org'),

    contracts: {
      booking: await secretManager.getSecret('BOOKING_CONTRACT_ID', 'DEFAULT_ID'),
      airline: await secretManager.getSecret('AIRLINE_CONTRACT_ID', 'DEFAULT_ID'),
      refund: await secretManager.getSecret('REFUND_CONTRACT_ID', 'DEFAULT_ID'),
      loyalty: await secretManager.getSecret('LOYALTY_CONTRACT_ID', 'DEFAULT_ID'),
      governance: await secretManager.getSecret('GOVERNANCE_CONTRACT_ID', 'DEFAULT_ID'),
      token: await secretManager.getSecret('TOKEN_CONTRACT_ID', 'DEFAULT_ID'),
      flightRegistry: await secretManager.getSecret('FLIGHT_REGISTRY_CONTRACT_ID', 'DEFAULT_ID'),
    },

    databaseUrl: await secretManager.getSecret('DATABASE_URL', 'sqlite::memory:'),
    redisUrl: await secretManager.getSecret('REDIS_URL', 'redis://localhost:6379'),
    mongoUrl: await secretManager.getSecret('MONGO_URI', ''),

    jwtSecret,
    jwtExpiresIn: await secretManager.getSecret('JWT_EXPIRES_IN', '1h'),
    jwtRefreshSecret,
    jwtRefreshExpiresIn: await secretManager.getSecret('JWT_REFRESH_EXPIRES_IN', '7d'),

    adminApiKey,
    encryptionKey,

    logLevel: await secretManager.getSecret('LOG_LEVEL', 'info'),
    auditLogEnabled: (await secretManager.getSecret('AUDIT_LOG_ENABLED', 'false')) === 'true',
    nonceExpirySeconds: parseInteger(await secretManager.getSecret('NONCE_EXPIRY_SECONDS', '300'), 300),

    enableTracing: (await secretManager.getSecret('ENABLE_TRACING', 'false')) === 'true' || (await secretManager.getSecret('OTEL_SDK_DISABLED', 'true')) === 'false',
    otelServiceName: await secretManager.getSecret('OTEL_SERVICE_NAME', 'traqora-backend'),
    otelServiceVersion: await secretManager.getSecret('OTEL_SERVICE_VERSION', '0.1.0'),
    otlpTraceUrl: await secretManager.getSecret('OTLP_TRACE_URL', 'http://localhost:4318/v1/traces'),
    otlpTraceHeaders: await secretManager.getSecret('OTEL_EXPORTER_OTLP_TRACES_HEADERS', ''),
    tracingSampleRate: parseNumber(await secretManager.getSecret('TRACING_SAMPLE_RATE', '1'), 1),

    rateLimitMax: parseInteger(await secretManager.getSecret('RATE_LIMIT_MAX', '1000'), 1000),
    rateLimitWindowSec: parseInteger(await secretManager.getSecret('RATE_LIMIT_WINDOW_SEC', '60'), 60),
    rateLimitPublicMax: parseInteger(await secretManager.getSecret('RATE_LIMIT_PUBLIC_MAX', '100'), 100),
    rateLimitUserMax: parseInteger(await secretManager.getSecret('RATE_LIMIT_USER_MAX', '300'), 300),
    rateLimitPremiumMax: parseInteger(await secretManager.getSecret('RATE_LIMIT_PREMIUM_MAX', '1000'), 1000),
    ddosBurstMax: parseInteger(await secretManager.getSecret('DDOS_BURST_MAX', '250'), 250),
    ddosBurstWindowSec: parseInteger(await secretManager.getSecret('DDOS_BURST_WINDOW_SEC', '60'), 60),
    rateLimitBlockDurationSec: parseInteger(await secretManager.getSecret('RATE_LIMIT_BLOCK_DURATION_SEC', '900'), 900),
    rateLimitBlockAfterViolations: parseInteger(await secretManager.getSecret('RATE_LIMIT_BLOCK_AFTER_VIOLATIONS', '5'), 5),
    captchaAfterViolations: parseInteger(await secretManager.getSecret('CAPTCHA_AFTER_VIOLATIONS', '3'), 3),
    useCloudflareHeaders: (await secretManager.getSecret('USE_CLOUDFLARE_HEADERS', 'false')) === 'true',

    flightSearchCacheTtlSeconds: parseInteger(await secretManager.getSecret('FLIGHT_SEARCH_CACHE_TTL_SECONDS', '300'), 300),
    flightRegistryCacheTtlSeconds: parseInteger(await secretManager.getSecret('FLIGHT_REGISTRY_CACHE_TTL_SECONDS', '60'), 60),

    sendgridApiKey: await secretManager.getSecret('SENDGRID_API_KEY', ''),
    firebaseServiceAccount: await secretManager.getSecret('FIREBASE_SERVICE_ACCOUNT', ''),
    twilioAccountSid: await secretManager.getSecret('TWILIO_ACCOUNT_SID', ''),
    twilioAuthToken: await secretManager.getSecret('TWILIO_AUTH_TOKEN', ''),
    twilioPhoneNumber: await secretManager.getSecret('TWILIO_PHONE_NUMBER', ''),

    clientId: await secretManager.getSecret('AMADEUS_CLIENT_ID', ''),
    clientSecret: await secretManager.getSecret('AMADEUS_CLIENT_SECRET', ''),
    baseUrl: await secretManager.getSecret('AMADEUS_BASE_URL', ''),
    timeout: parseInteger(await secretManager.getSecret('AMADEUS_TIMEOUT_MS', '30000'), 30000),
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
    activeConfig = rawConfig as any as Config;
  } else {
    activeConfig = result.data;
    logger.info(`Configuration loaded successfully for environment: ${activeConfig.environment}`);
  }

  // Check secret rotation for JWT
  if (activeConfig.environment === 'production') {
    await secretManager.checkSecretRotation('JWT_SECRET', 90);
  }

  return activeConfig;
}

export const getConfig = (): Config => {
  if (!activeConfig) {
    activeConfig = configSchema.parse(readConfigFromEnv());
  }

  return activeConfig;
};

// Backward-compatible live config object for existing modules.
export const config = new Proxy({} as Config, {
  get: (_target, property: string | symbol) => {
    if (typeof property === 'symbol') {
      return undefined;
    }

    return getConfig()[property as keyof Config];
  },
});
