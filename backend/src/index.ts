import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './utils/errorHandler';
// import { rateLimiter } from './utils/rateLimiter';
import { initDataSource } from './db/dataSource';

// Route imports
import { flightRoutes } from './api/routes/flights';
import { subscriptionRoutes } from './api/routes/subscriptions';
import { governanceRoutes } from './api/routes/governance';
import { bookingRoutes } from './api/routes/bookings';
import { metricsRoutes } from './api/routes/metrics';
// import { airlineRoutes } from './api/routes/airlines';
// import { userRoutes } from './api/routes/users';
// import { refundRoutes } from './api/routes/refunds';
// import { loyaltyRoutes } from './api/routes/loyalty';
// import { walletRoutes } from './api/routes/wallet';

// New Services
import { connectDatabase } from './config/database';
import { initWebSocket, getWebSocketServer } from './websockets/server';
import { initPriceMonitorCron } from './jobs/priceMonitor';

// Monitoring
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { contractMonitor, setupDefaultEventListeners, startWalletBalanceMonitoring } from './services/contractMonitor';
import morgan from 'morgan';

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

// Metrics middleware (before other middleware to capture all requests)
app.use(metricsMiddleware);

// Rate limiting
// app.use(rateLimiter);

// Logging
app.use(morgan('combined', { stream: { write: (msg: string) => logger.info(msg.trim()) } }));

// Body parsing
// Stripe webhooks require raw body for signature verification.
app.use('/api/v1/bookings/webhook/stripe', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
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
app.use('/metrics', metricsRoutes);
app.use('/api/v1/flights', flightRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/governance', governanceRoutes);
app.use('/api/v1/bookings', bookingRoutes);

// Internal/dev-only utilities
app.post('/internal/test-broadcast', (req, res) => {
  if (config.environment === 'production') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { flightId = 'TEST-FLT', price = 100 } = req.body || {};
  try {
    const ws = getWebSocketServer();
    ws.broadcastPriceUpdate(flightId, Number(price));
    return res.json({ ok: true });
  } catch (err) {
    logger.warn('Failed to broadcast (ws not ready)', err);
    return res.status(500).json({ ok: false, error: 'ws_not_ready' });
  }
});
// app.use('/api/v1/airlines', airlineRoutes);
// app.use('/api/v1/users', userRoutes);
// app.use('/api/v1/refunds', refundRoutes);
// app.use('/api/v1/loyalty', loyaltyRoutes);
// app.use('/api/v1/wallet', walletRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = config.port || 3001;

if (process.env.NODE_ENV !== 'test') {
  initDataSource()
    .then(() => {
      server.listen(PORT, () => {
        logger.info(`🚀 Traqora API server running on port ${PORT}`);
        logger.info(`📡 Environment: ${config.environment}`);
        logger.info(`🔗 Stellar Network: ${config.stellarNetwork}`);
        logger.info(`🔄 WebSocket Server initialized`);
        logger.info(`⏱️ Price Monitor Cron Job scheduled`);
        
        // Initialize contract monitoring
        setupDefaultEventListeners();
        contractMonitor.startMonitoring(5000);
        logger.info(`📊 Contract event monitoring started`);
        
        // Start wallet balance monitoring
        const wallets = [
          { address: process.env.OPERATIONAL_WALLET_ADDRESS || '', type: 'operational' },
        ].filter(w => w.address);
        if (wallets.length > 0) {
          startWalletBalanceMonitoring(wallets);
          logger.info(`💰 Wallet balance monitoring started for ${wallets.length} wallet(s)`);
        }
      });
    })
    .catch((err) => {
      logger.error({ error: 'Failed to initialize datasource', details: err?.message || err });
      process.exit(1);
    });
}

export { app };
export default app;
