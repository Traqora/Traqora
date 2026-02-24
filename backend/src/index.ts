import 'dotenv/config';
import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const app = createApp();

app.listen(config.port, () => {
  logger.info(`Traqora API server running on port ${config.port}`);
  logger.info(`Environment: ${config.environment}`);
  logger.info(`Stellar Network: ${config.stellarNetwork}`);
});

export default app;