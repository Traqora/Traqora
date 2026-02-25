export const config = {
  port: Number.parseInt(process.env.PORT || '3001', 10),
  environment: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',

  contracts: {
    booking: process.env.BOOKING_CONTRACT_ID || '',
    airline: process.env.AIRLINE_CONTRACT_ID || '',
    refund: process.env.REFUND_CONTRACT_ID || '',
    loyalty: process.env.LOYALTY_CONTRACT_ID || '',
    governance: process.env.GOVERNANCE_CONTRACT_ID || '',
    token: process.env.TOKEN_CONTRACT_ID || '',
  },

  databaseUrl: process.env.DATABASE_URL || '',
  // Mongo connection string (optional, used for notifications/history etc)
  mongoUrl: process.env.MONGO_URI || '',
  redisUrl: process.env.REDIS_URL || '',

  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  rateLimitWindowSec: Number.parseInt(process.env.RATE_LIMIT_WINDOW_SEC || '60', 10),
  rateLimitMax: Number.parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  flightSearchCacheTtlSeconds: Number.parseInt(
    process.env.FLIGHT_SEARCH_CACHE_TTL_SECONDS || '300',
    10
  ),

  logLevel: process.env.LOG_LEVEL || 'info',
};