import { configSchema, Config } from './schema';
import { logger } from '../utils/logger';

let activeConfig: Config | null = null;

export const loadConfig = async (): Promise<Config> => {
  try {
    const rawConfig = {
      port: Number.parseInt(process.env.PORT || '3001', 10),
      environment: (process.env.NODE_ENV || 'development') as any,
      corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

      stellarNetwork: (process.env.STELLAR_NETWORK || 'testnet') as any,
      stellarSecretKey: process.env.STELLAR_SECRET_KEY,
      horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
      sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',

      contracts: {
        booking: process.env.BOOKING_CONTRACT_ID || "DEFAULT_ID",
        airline: process.env.AIRLINE_CONTRACT_ID || "DEFAULT_ID",
        refund: process.env.REFUND_CONTRACT_ID || "DEFAULT_ID",
        loyalty: process.env.LOYALTY_CONTRACT_ID || "DEFAULT_ID",
        governance: process.env.GOVERNANCE_CONTRACT_ID || "DEFAULT_ID",
        token: process.env.TOKEN_CONTRACT_ID || "DEFAULT_ID",
        flightRegistry: process.env.FLIGHT_REGISTRY_CONTRACT_ID || "DEFAULT_ID",
      },

      databaseUrl: process.env.DATABASE_URL || 'sqlite::memory:',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      mongoUrl: process.env.MONGO_URI,

      jwtSecret: process.env.JWT_SECRET || 'your-secret-key-at-least-32-chars-long',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
      jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-at-least-32-chars-long',
      jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      
      adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key-at-least-16-chars',

      logLevel: (process.env.LOG_LEVEL || 'info') as any,
      auditLogEnabled: process.env.AUDIT_LOG_ENABLED === 'true',
      nonceExpirySeconds: Number.parseInt(process.env.NONCE_EXPIRY_SECONDS || '300', 10),
    };

    activeConfig = configSchema.parse(rawConfig);
    return activeConfig;
  } catch (error) {
    logger.error('Configuration validation failed:', error);
    throw error;
  }
};

export const getConfig = (): Config => {
  if (!activeConfig) {
    throw new Error('Config not loaded. Call loadConfig() first.');
  }
  return activeConfig;
};

// For backward compatibility while migrating
export const config = {
  get redisUrl() { return getConfig().redisUrl; },
  get jwtSecret() { return getConfig().jwtSecret; },
  get jwtExpiresIn() { return getConfig().jwtExpiresIn; },
  get jwtRefreshSecret() { return getConfig().jwtRefreshSecret; },
  get jwtRefreshExpiresIn() { return getConfig().jwtRefreshExpiresIn; },
  get stellarNetwork() { return getConfig().stellarNetwork; },
  get nonceExpirySeconds() { return getConfig().nonceExpirySeconds; },
  get adminApiKey() { return getConfig().adminApiKey; },
  get port() { return getConfig().port; },
  get environment() { return getConfig().environment; },
  get databaseUrl() { return getConfig().databaseUrl; },
  get contracts() { return getConfig().contracts; },
} as any;
