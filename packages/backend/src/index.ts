import 'dotenv/config';
import http from 'http';
import { loadConfig } from './config';
import { initializeTracing, shutdownTracing } from './tracing';
import { configureLogger, logger } from './utils/logger';

async function startServer() {
  try {
    const config = await loadConfig();
    configureLogger(config);
    initializeTracing(config);

    const [
      appModule,
      { initDataSource },
      { initWebSocket },
      { initPriceMonitorCron },
      { verifyConnectivity },
      contractMonitorModule,
    ] = await Promise.all([
      import('./app'),
      import('./db/dataSource'),
      import('./websockets/server'),
      import('./jobs/priceMonitor'),
      import('./utils/health-check'),
      import('./services/contractMonitor'),
    ]);

    await verifyConnectivity();

    const app = await appModule.createApp();
    const server = http.createServer(app);

    initWebSocket(server);
    initPriceMonitorCron();

    const PORT = config.port || 3001;

    if (process.env.NODE_ENV !== 'test') {
      await initDataSource();

      server.listen(PORT, () => {
        logger.info('Traqora API server started', {
          port: PORT,
          environment: config.environment,
          stellarNetwork: config.stellarNetwork,
        });

        contractMonitorModule.setupDefaultEventListeners();
        contractMonitorModule.contractMonitor.startMonitoring(5000);

        const wallets = [
          { address: process.env.OPERATIONAL_WALLET_ADDRESS || '', type: 'operational' },
        ].filter((wallet) => wallet.address);

        if (wallets.length > 0) {
          contractMonitorModule.startWalletBalanceMonitoring(wallets);
        }
      });
    }

    const shutdown = async () => {
      await shutdownTracing();
      server.close();
    };

    process.once('SIGTERM', () => {
      shutdown()
        .then(() => process.exit(0))
        .catch((error) => {
          logger.error('Error during SIGTERM shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        });
    });

    return { app, server };
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

const serverPromise = startServer();

export const appPromise = serverPromise.then((server) => server.app);
export default serverPromise;
