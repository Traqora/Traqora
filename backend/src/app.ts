import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { createFlightRoutes } from './api/routes/flights';
import { config } from './config';
import {
  createDefaultFlightSearchService,
  FlightSearchService,
} from './services/flightSearchService';
import { errorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';
import { createIpRateLimiter, IpRateLimitOptions } from './utils/rateLimiter';

export interface AppOptions {
  flightSearchService?: FlightSearchService;
  globalRateLimit?: false | Partial<IpRateLimitOptions>;
  searchRateLimit?: Partial<IpRateLimitOptions>;
}

export const createApp = (options: AppOptions = {}) => {
  const app = express();

  const flightSearchService = options.flightSearchService || createDefaultFlightSearchService();

  const globalRateLimitMiddleware =
    options.globalRateLimit === false
      ? null
      : createIpRateLimiter({
          points: config.rateLimitMax,
          durationSeconds: config.rateLimitWindowSec,
          keyPrefix: 'traqora-global-rate-limit',
          ...options.globalRateLimit,
        });

  const searchRateLimitMiddleware = createIpRateLimiter({
    points: 100,
    durationSeconds: 60,
    keyPrefix: 'traqora-flight-search-rate-limit',
    ...options.searchRateLimit,
  });

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
    })
  );

  if (globalRateLimitMiddleware) {
    app.use(globalRateLimitMiddleware);
  }

  app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    });
  });

  app.use('/api/v1/flights', createFlightRoutes(flightSearchService, searchRateLimitMiddleware));

  app.use(errorHandler);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
};