import { configSchema, Config } from './schema';

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

    jwtSecret: process.env.JWT_SECRET || 'your-secret-key-at-least-32-chars-long',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-at-least-32-chars-long',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

    adminApiKey: process.env.ADMIN_API_KEY || (nodeEnv === 'test' ? 'dev-admin-key' : 'dev-admin-key-at-least-16-chars'),

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
  activeConfig = configSchema.parse(readConfigFromEnv());
  return activeConfig;
};

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
