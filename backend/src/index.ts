import './tracing';
import http from 'http';
import dotenv from 'dotenv';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { initDataSource } from './db/dataSource';
import { initWebSocket } from './websockets/server';
import { initPriceMonitorCron } from './jobs/priceMonitor';
import {
  contractMonitor,
  setupDefaultEventListeners,
  startWalletBalanceMonitoring,
} from './services/contractMonitor';

dotenv.config();

const app = createApp();
const server = http.createServer(app);

initWebSocket(server);
initPriceMonitorCron();

const PORT = config.port || 3001;

if (process.env.NODE_ENV !== 'test') {
  initDataSource()
    .then(() => {
      server.listen(PORT, () => {
        logger.info(`Traqora API server running on port ${PORT}`);
        logger.info(`Environment: ${config.environment}`);
        logger.info(`Stellar Network: ${config.stellarNetwork}`);

        setupDefaultEventListeners();
        contractMonitor.startMonitoring(5000);

        const wallets = [
          { address: process.env.OPERATIONAL_WALLET_ADDRESS || '', type: 'operational' },
        ].filter((wallet) => wallet.address);

        if (wallets.length > 0) {
          startWalletBalanceMonitoring(wallets);
        }
      });
    })
    .catch((error) => {
      logger.error({
        error: 'Failed to initialize datasource',
        details: error instanceof Error ? error.message : String(error),
      });
      process.exit(1);
    });
}

export { app };
export default app;
