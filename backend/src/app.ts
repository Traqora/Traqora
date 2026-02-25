import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { createFlightRoutes } from './api/routes/flights';
import { securityRoutes } from './api/routes/security';
import { config } from './config';
import {
  createDefaultFlightSearchService,
  FlightSearchService,
} from './services/flightSearchService';
import { errorHandler } from './utils/errorHandler';
import { logger } from './utils/logger';
import {
  createIpRateLimiter,
  createTieredRateLimiter,
  IpRateLimitOptions,
  TieredRateLimitOptions,
} from './utils/rateLimiter';

export interface AppOptions {
  flightSearchService?: FlightSearchService;
  globalRateLimit?: false | Partial<IpRateLimitOptions>;
  tieredRateLimit?: false | Partial<TieredRateLimitOptions>;
  searchRateLimit?: Partial<IpRateLimitOptions>;
}

export const createApp = (options: AppOptions = {}) => {
  const app = express();

  if (config.trustProxy) {
    app.set('trust proxy', 1);
  }

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

  const tieredRateLimitMiddleware =
    options.tieredRateLimit === false
      ? null
      : createTieredRateLimiter({
          keyPrefix: 'traqora-tiered-rate-limit',
          redisUrl: config.redisUrl || undefined,
          trustProxy: config.trustProxy,
          useCloudflareHeaders: config.useCloudflareHeaders,
          public: {
            points: config.rateLimitPublicMax,
            durationSeconds: config.rateLimitWindowSec,
          },
          user: {
            points: config.rateLimitUserMax,
            durationSeconds: config.rateLimitWindowSec,
          },
          premium: {
            points: config.rateLimitPremiumMax,
            durationSeconds: config.rateLimitWindowSec,
          },
          ddos: {
            points: config.ddosBurstMax,
            durationSeconds: config.ddosBurstWindowSec,
          },
          blockDurationSeconds: config.rateLimitBlockDurationSec,
          blockAfterViolations: config.rateLimitBlockAfterViolations,
          captchaAfterViolations: config.captchaAfterViolations,
          ...options.tieredRateLimit,
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

  if (tieredRateLimitMiddleware) {
    app.use(tieredRateLimitMiddleware);
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
  app.use('/api/v1/security', securityRoutes);

  app.use(errorHandler);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
};