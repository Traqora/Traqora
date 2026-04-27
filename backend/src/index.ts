import http from 'http';
import dotenv from 'dotenv';
import { createApp } from './app';
import { loadConfig, getConfig } from './config';
import { logger } from './utils/logger';
import { initDataSource } from './db/dataSource';
import { initWebSocket } from './websockets/server';
import { initPriceMonitorCron } from './jobs/priceMonitor';
import { verifyConnectivity } from './utils/health-check';
import {
  contractMonitor,
  setupDefaultEventListeners,
  startWalletBalanceMonitoring,
} from './services/contractMonitor';

dotenv.config();

async function startServer() {
  try {
    // 1. Load and validate configuration
    const config = await loadConfig();
    
    // 2. Verify connectivity to infrastructure (DB, Redis, Stellar)
    await verifyConnectivity();

    const app = createApp();
    const server = http.createServer(app);

    initWebSocket(server);
    initPriceMonitorCron();

    const PORT = config.port || 3001;

    if (process.env.NODE_ENV !== 'test') {
      await initDataSource();
      
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
    }

    return { app, server };
  } catch (error) {
    logger.error({
      error: 'Failed to start server',
      details: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

const serverPromise = startServer();

export const appPromise = serverPromise.then(s => s.app);
export default serverPromise;

