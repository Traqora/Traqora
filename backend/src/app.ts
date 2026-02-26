import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { createFlightRoutes } from './api/routes/flights';
import { bookingRoutes } from './api/routes/bookings';
import { refundRoutes } from './api/routes/refunds';
import { securityRoutes } from './api/routes/security';
import { adminAuthRoutes } from './api/routes/admin/auth';
import { adminFlightRoutes } from './api/routes/admin/flights';
import { adminUserRoutes } from './api/routes/admin/users';
import { adminBookingRoutes } from './api/routes/admin/bookings';
import { adminAnalyticsRoutes } from './api/routes/admin/analytics';
import { adminRefundRoutes } from './api/routes/admin/refunds';
import { authRoutes } from './api/routes/auth';
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
import { requireAuth } from './middleware/authMiddleware';

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

  // Stripe webhook requires raw body — must be registered BEFORE express.json()
  app.use('/api/v1/bookings/webhook/stripe', express.raw({ type: '*/*' }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/flights', createFlightRoutes(flightSearchService, searchRateLimitMiddleware));
  app.use('/api/v1/bookings', requireAuth, bookingRoutes);
  app.use('/api/v1/refunds', requireAuth, refundRoutes);
  app.use('/api/v1/security', requireAuth, securityRoutes);

  // Admin routes
  app.use('/api/v1/admin/auth', adminAuthRoutes);
  app.use('/api/v1/admin/flights', adminFlightRoutes);
  app.use('/api/v1/admin/users', adminUserRoutes);
  app.use('/api/v1/admin/bookings', adminBookingRoutes);
  app.use('/api/v1/admin/analytics', adminAnalyticsRoutes);
  app.use('/api/v1/admin/refunds', adminRefundRoutes);

  app.use(errorHandler);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
  });

  return app;
};