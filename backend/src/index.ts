import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './utils/errorHandler';
import { rateLimiter } from './utils/rateLimiter';

// Route imports
import { flightRoutes } from './api/routes/flights';
import { bookingRoutes } from './api/routes/bookings';
import { airlineRoutes } from './api/routes/airlines';
import { userRoutes } from './api/routes/users';
import { refundRoutes } from './api/routes/refunds';
import { loyaltyRoutes } from './api/routes/loyalty';
import { governanceRoutes } from './api/routes/governance';
import { walletRoutes } from './api/routes/wallet';

dotenv.config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// Rate limiting
app.use(rateLimiter);

// Logging
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
  });
});

// API routes
app.use('/api/v1/flights', flightRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/airlines', airlineRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/refunds', refundRoutes);
app.use('/api/v1/loyalty', loyaltyRoutes);
app.use('/api/v1/governance', governanceRoutes);
app.use('/api/v1/wallet', walletRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = config.port || 3001;

app.listen(PORT, () => {
  logger.info(`🚀 Traqora API server running on port ${PORT}`);
  logger.info(`📡 Environment: ${config.environment}`);
  logger.info(`🔗 Stellar Network: ${config.stellarNetwork}`);
});

export default app;
