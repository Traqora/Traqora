import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';
import { config } from '../config';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

const addCorrelationId = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store && store.has('correlationId')) {
    info.correlationId = store.get('correlationId');
  }
  return info;
});

export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    addCorrelationId(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'traqora-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

if (config.environment === 'production') {
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
}
// Provide default export for convenience
export default logger;