import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { delayedRefundProcessor } from './jobs/delayedRefundProcessor';

const app = createApp();

if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_AUTO_START !== 'true') {
  app.listen(config.port, () => {
    logger.info(`Traqora backend listening on port ${config.port}`);
    
    // Start delayed refund processor
    const processorInterval = parseInt(process.env.REFUND_PROCESSOR_INTERVAL || '15', 10);
    delayedRefundProcessor.startPeriodicProcessing(processorInterval);
    logger.info(`Delayed refund processor started with ${processorInterval} minute interval`);
  });
}

export { app };
export default app;
