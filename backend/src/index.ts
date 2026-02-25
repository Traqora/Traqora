import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';

const app = createApp();

if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_AUTO_START !== 'true') {
  app.listen(config.port, () => {
    logger.info(`Traqora backend listening on port ${config.port}`);
  });
}

export { app };
export default app;
