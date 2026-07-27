import fs from 'fs';
import path from 'path';
import winston, { Logger } from 'winston';
import { AsyncLocalStorage } from 'async_hooks';
import { Config } from '../config/schema';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

const SENSITIVE_LOG_KEY = /authorization|cookie|set-cookie|password|token|secret|api[_-]?key|jwt|refresh_token/i;

const sanitizeLogValue = (value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack ?? null,
    };
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeLogValue);
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = SENSITIVE_LOG_KEY.test(key)
        ? '[REDACTED]'
        : sanitizeLogValue(nestedValue);
    }
    return sanitized;
  }
  return value;
};

const addCorrelationId = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store && store.has('correlationId')) {
    info.correlationId = store.get('correlationId');
  }
  return info;
});

const maskSensitiveFields = winston.format((info) => {
  return sanitizeLogValue(info) as winston.Logform.TransformableInfo;
});

const jsonLogFormat = winston.format.combine(
  addCorrelationId(),
  winston.format.errors({ stack: true }),
  winston.format.timestamp(),
  maskSensitiveFields(),
  winston.format.json(),
);

const consoleTransport = new winston.transports.Console();
let productionFileTransportsConfigured = false;

const createFileTransports = (logDirectory: string, level: string) => {
  if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
  }

  return [
    new winston.transports.File({ filename: path.join(logDirectory, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDirectory, 'combined.log'), level }),
  ];
};

const createAggregationTransport = (aggregationUrl: string) => {
  try {
    const url = new URL(aggregationUrl);
    return new winston.transports.Http({
      host: url.hostname,
      port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      ssl: url.protocol === 'https:',
      auth:
        url.username && url.password
          ? { username: url.username, password: url.password }
          : undefined,
    });
  } catch {
    return null;
  }
};

export const logger: Logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonLogFormat,
  defaultMeta: {
    service: 'traqora-api',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [consoleTransport],
});

export const configureLogger = (runtimeConfig: Pick<Config, 'logLevel' | 'environment'>) => {
  logger.level = runtimeConfig.logLevel;
  for (const transport of logger.transports) {
    transport.level = runtimeConfig.logLevel;
  }

  if (runtimeConfig.environment === 'production' && !productionFileTransportsConfigured) {
    const logDirectory = path.resolve(process.cwd(), 'logs');
    for (const transport of createFileTransports(logDirectory, runtimeConfig.logLevel)) {
      logger.add(transport);
    }
    productionFileTransportsConfigured = true;
  }

  const logAggregationUrl = process.env.LOG_AGGREGATION_URL;
  if (logAggregationUrl) {
    const aggregationTransport = createAggregationTransport(logAggregationUrl);
    if (aggregationTransport) {
      logger.add(aggregationTransport);
    }
  }
};

export default logger;
