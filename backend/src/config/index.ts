export const config = {
  port: parseInt(process.env.PORT || '3001'),
  environment: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  
  // Stellar configuration
  stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
  horizonUrl: process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',
  
  // Contract IDs (to be filled after deployment)
  contracts: {
    booking: process.env.BOOKING_CONTRACT_ID || '',
    airline: process.env.AIRLINE_CONTRACT_ID || '',
    refund: process.env.REFUND_CONTRACT_ID || '',
    loyalty: process.env.LOYALTY_CONTRACT_ID || '',
    governance: process.env.GOVERNANCE_CONTRACT_ID || '',
    token: process.env.TOKEN_CONTRACT_ID || '',
  },
  
  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  // Mongo connection string (optional, used for notifications/history etc)
  mongoUrl: process.env.MONGO_URI || '',
  redisUrl: process.env.REDIS_URL || '',
  
  // Authentication
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  
  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
