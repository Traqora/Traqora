import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';
import { Config } from '../config/schema';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

const addCorrelationId = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store && store.has('correlationId')) {
    info.correlationId = store.get('correlationId');
  }
  return info;
});

const jsonLogFormat = winston.format.combine(
  addCorrelationId(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleTransport = new winston.transports.Console();
let productionFileTransportsConfigured = false;

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonLogFormat,
  defaultMeta: { service: 'traqora-api' },
  transports: [consoleTransport],
});

export const configureLogger = (runtimeConfig: Pick<Config, 'logLevel' | 'environment'>) => {
  logger.level = runtimeConfig.logLevel;

  for (const transport of logger.transports) {
    transport.level = runtimeConfig.logLevel;
  }

  if (runtimeConfig.environment === 'production' && !productionFileTransportsConfigured) {
    logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
    logger.add(new winston.transports.File({ filename: 'logs/combined.log', level: runtimeConfig.logLevel }));
    productionFileTransportsConfigured = true;
  }
};

export default logger;
