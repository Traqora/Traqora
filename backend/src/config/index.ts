import { configSchema, Config } from './schema';
import { SecretManager } from '../services/secret-manager.service';
import { Logger } from '../utils/logger';

let validatedConfig: Config;

export async function loadConfig(): Promise<Config> {
  const secretManager = SecretManager.getInstance();

  const rawConfig = {
    port: Number.parseInt(await secretManager.getSecret('PORT', '3001'), 10),
    environment: await secretManager.getSecret('NODE_ENV', 'development'),
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

    jwtSecret: await secretManager.getSecret('JWT_SECRET', 'your-secret-key-change-in-production-at-least-32-chars'),
    jwtExpiresIn: await secretManager.getSecret('JWT_EXPIRES_IN', '1h'),
    jwtRefreshSecret: await secretManager.getSecret('JWT_REFRESH_SECRET', 'your-refresh-secret-change-in-production-at-least-32-chars'),
    jwtRefreshExpiresIn: await secretManager.getSecret('JWT_REFRESH_EXPIRES_IN', '7d'),
    
    adminApiKey: await secretManager.getSecret('ADMIN_API_KEY', 'dev-admin-key-at-least-16-chars'),

    logLevel: await secretManager.getSecret('LOG_LEVEL', 'info'),
    auditLogEnabled: (await secretManager.getSecret('AUDIT_LOG_ENABLED', 'false')) === 'true',
  };

  const result = configSchema.safeParse(rawConfig);

  if (!result.success) {
    const errors = result.error.format();
    Logger.error('Invalid configuration detected:', new Error(JSON.stringify(errors, null, 2)));
    
    if (rawConfig.environment === 'production') {
      Logger.error('CRITICAL: Production environment started with invalid configuration. Terminating process.');
      process.exit(1);
    }
    
    Logger.warn('Continuing in development mode with schema warnings...');
    validatedConfig = rawConfig as any as Config;
  } else {
    validatedConfig = result.data;
    Logger.info(`Configuration loaded successfully for environment: ${validatedConfig.environment}`);
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

// Legacy support for direct config export (will need to be initialized)
export const config = {} as Config;
