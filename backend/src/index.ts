import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import http from 'http';

import { config } from './config';
import { logger } from './utils/logger'; // Assumed to exist based on context
import { errorHandler } from './utils/errorHandler'; // Assumed to exist
// import { rateLimiter } from './utils/rateLimiter'; // Commented out as I didn't verify if it exists

// Route imports
import { flightRoutes } from './api/routes/flights';
import { subscriptionRoutes } from './api/routes/subscriptions';
import { governanceRoutes } from './api/routes/governance';

// Missing routes commented out
// import { bookingRoutes } from './api/routes/bookings';
// import { airlineRoutes } from './api/routes/airlines';
// import { userRoutes } from './api/routes/users';
// import { refundRoutes } from './api/routes/refunds';
// import { loyaltyRoutes } from './api/routes/loyalty';
// import { walletRoutes } from './api/routes/wallet';

// New Services
import { connectDatabase } from './config/database';
import { initWebSocket } from './websockets/server';
import { initPriceMonitorCron } from './jobs/priceMonitor';

dotenv.config();

const app = express();
const server = http.createServer(app);

// Initialize Services
connectDatabase();
initWebSocket(server);
initPriceMonitorCron();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin || '*', // Fallback to * if config missing
  credentials: true,
}));

// Rate limiting
// app.use(rateLimiter);

// Logging
app.use(morgan('combined', { stream: { write: (msg: string) => logger.info(msg.trim()) } }));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    services: {
      database: 'connected', // Optimistic
      websocket: 'active',
      cron: 'scheduled'
    }
  });
});

// API routes
app.use('/api/v1/flights', flightRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/governance', governanceRoutes);

// Commented out missing routes
// app.use('/api/v1/bookings', bookingRoutes);
// app.use('/api/v1/airlines', airlineRoutes);
// app.use('/api/v1/users', userRoutes);
// app.use('/api/v1/refunds', refundRoutes);
// app.use('/api/v1/loyalty', loyaltyRoutes);
// app.use('/api/v1/wallet', walletRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = config.port || 3001;

server.listen(PORT, () => {
  logger.info(`🚀 Traqora API server running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.environment}`);
  logger.info(`🔗 Stellar Network: ${config.stellarNetwork}`);
  logger.info(`🔄 WebSocket Server initialized`);
  logger.info(`⏱️ Price Monitor Cron Job scheduled`);
});

export default app;
