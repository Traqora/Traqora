import fs from 'fs';
import path from 'path';
import winston, { Logger } from 'winston';
import { AsyncLocalStorage } from 'async_hooks';
import { Config } from '../config/schema';
import { deriveEventName, redactLogRecord, resolveLogFormat } from './structuredLogger';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

const addCorrelationId = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store) {
    if (store.has('correlationId')) {
      info.correlationId = store.get('correlationId');
    }
    if (store.has('requestId')) {
      info.requestId = store.get('requestId');
    }
  }
  return info;
});

/**
 * Guarantee the `event` key of the structured envelope (issue #738). Callers
 * that already pass `event` keep it; otherwise it is derived from the message.
 */
const attachEvent = winston.format((info) => {
  if (typeof info.event !== 'string' || info.event.length === 0) {
    info.event = deriveEventName(info.message);
  }
  return info;
});

/**
 * Recursive, cycle-safe redaction shared with the rest of the codebase. Total
 * function: a payload that cannot be serialised must never throw out of a log
 * call and take the request handler with it.
 */
const maskSensitiveFields = winston.format((info) => {
  return redactLogRecord(info);
});

const prettyFormat = winston.format.printf((info: winston.Logform.TransformableInfo) => {
  const { level, message, timestamp, event, ...rest } = info;
  const corr = info.correlationId ? ` (${String(info.correlationId)})` : '';
  const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `${String(timestamp)} ${String(level)} [${String(event ?? 'log')}]${corr}: ${String(message)}${extra}`;
});

/**
 * Build the output format for the resolved {@link resolveLogFormat} value.
 * `LOG_FORMAT=json` forces the JSON envelope in every environment, which is
 * what staging, CI and log shippers require.
 */
const buildOutputFormat = (environment?: string) =>
  resolveLogFormat(process.env, environment) === 'pretty'
    ? winston.format.combine(winston.format.colorize(), prettyFormat)
    : winston.format.json();

/** Full format chain: correlation → errors → timestamp → event → redaction → render. */
const buildLogFormat = (environment?: string) =>
  winston.format.combine(
    addCorrelationId(),
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    attachEvent(),
    maskSensitiveFields(),
    buildOutputFormat(environment),
  );

const jsonLogFormat = buildLogFormat();

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

  // Re-resolve the output format so that LOG_FORMAT exported by the process
  // supervisor (which is loaded after this module) is honoured.
  logger.format = buildLogFormat(runtimeConfig.environment);

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
