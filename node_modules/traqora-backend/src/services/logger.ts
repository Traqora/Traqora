import winston from 'winston';
import { Config } from '../config/schema';
import { deriveEventName, redactLogRecord, redactValue, resolveLogFormat, safeStringify } from '../utils/structuredLogger';
import { asyncLocalStorage } from '../utils/logger';

/**
 * Re-exported so that request correlation set by the request middleware is
 * visible to `LoggerService` too. Both loggers previously owned a private
 * `AsyncLocalStorage`, which meant `correlationId` silently disappeared from
 * half the codebase's logs (issue #738).
 */
export { asyncLocalStorage };

export interface LogContext {
  requestId?: string;
  userId?: string;
  adminId?: string;
  sessionId?: string;
  correlationId?: string;
  component?: string;
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Redact secrets across the whole record. Kept as a named export for the
 * callers that format a record outside of the winston chain.
 */
const redactSensitive = (info: Record<string, unknown>): Record<string, unknown> =>
  redactValue(info) as Record<string, unknown>;
const addContext = winston.format((info) => {
  const store = asyncLocalStorage.getStore();
  if (store) {
    for (const [key, value] of store) {
      if (!info[key]) {
        info[key] = value;
      }
    }
  }
  return info;
});

/** Guarantee the `event` key of the structured envelope (issue #738). */
const attachEvent = winston.format((info) => {
  if (typeof info.event !== 'string' || info.event.length === 0) {
    info.event = deriveEventName(info.message);
  }
  return info;
});

/**
 * `details` is a pre-serialised JSON string for the audit trail, so it is
 * parsed, redacted and re-serialised. The record itself is redacted wholesale
 * by `maskSensitive` below.
 */
const maskSensitive = winston.format((info) => {
  if (info.details) {
    try {
      const parsed: Record<string, unknown> =
        typeof info.details === 'string' ? JSON.parse(info.details) as Record<string, unknown> : info.details as Record<string, unknown>;
      info.details = JSON.stringify(redactSensitive(parsed));
    } catch {
      /* non-serializable details — skip masking */
    }
  }
  return redactLogRecord(info) as winston.Logform.TransformableInfo;
});

const jsonFormat = winston.format.combine(
  addContext(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  attachEvent(),
  maskSensitive(),
  winston.format.json(),
);

export class LoggerService {
  private logger: winston.Logger;
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
    this.logger = createBaseLogger();
  }

  child(subContext: LogContext): LoggerService {
    return new LoggerService({ ...this.context, ...subContext });
  }

  private enrich(entry: Record<string, unknown>): Record<string, unknown> {
    const store = asyncLocalStorage.getStore();
    return {
      ...entry,
      ...this.context,
      correlationId: entry.correlationId || this.context.correlationId || (store?.get('correlationId') as string) || undefined,
      requestId: entry.requestId || this.context.requestId || (store?.get('requestId') as string) || undefined,
      component: entry.component || this.context.component,
    };
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, this.enrich(meta || {}));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, this.enrich(meta || {}));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, this.enrich(meta || {}));
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, this.enrich(meta || {}));
  }

  log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    this.logger.log(level, message, this.enrich(meta || {}));
  }

  profile(id: string, meta?: Record<string, unknown>): void {
    this.logger.profile(id, this.enrich(meta || {}));
  }

  time<T>(label: string, fn: () => T): T;
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
  time<T>(label: string, fn: (() => T) | (() => Promise<T>)): T | Promise<T> {
    const start = Date.now();
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        this.info(`${label} completed`, { durationMs: Date.now() - start, label });
      }) as unknown as Promise<T>;
    }
    this.info(`${label} completed`, { durationMs: Date.now() - start, label });
    return result;
  }

  setLevel(level: string): void {
    this.logger.level = level;
    for (const transport of this.logger.transports) {
      transport.level = level;
    }
  }
}

function createBaseLogger(): winston.Logger {
  const level = process.env.LOG_LEVEL || 'info';
  const environment = process.env.NODE_ENV || 'development';
  // `LOG_FORMAT` wins over the NODE_ENV default so staging, CI and log
  // shippers can always get the JSON envelope (issue #738).
  const usePrettyFormat = resolveLogFormat(process.env, environment) === 'pretty';
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: usePrettyFormat
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf((info: winston.Logform.TransformableInfo) => {
              const { level, message, timestamp, ...rest } = info;
              const event = rest.event ? ` [${String(rest.event)}]` : '';
              const comp = rest.component ? ` [${String(rest.component)}]` : '';
              const corr = rest.correlationId ? ` (${String(rest.correlationId)})` : '';
              const extra = Object.keys(rest).length ? ` ${safeStringify(rest)}` : '';
              return `${String(timestamp)} ${String(level)}${event}${comp}${corr}: ${String(message)}${extra}`;
            }),
          )
        : undefined,
    }),
  ];

  if (environment === 'production') {
    transports.push(
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
        maxsize: 10 * 1024 * 1024,
        maxFiles: 10,
      }),
    );
  }

  return winston.createLogger({
    level,
    format: jsonFormat,
    defaultMeta: { service: 'traqora-api', environment },
    transports,
  });
}

let defaultLogger: LoggerService | null = null;
let defaultLoggerEnvironment: string | null = null;

export function getLogger(context?: LogContext): LoggerService {
  if (!defaultLogger) {
    defaultLogger = new LoggerService();
    defaultLoggerEnvironment = process.env.NODE_ENV || 'development';
  }
  return context ? defaultLogger.child(context) : defaultLogger;
}

export function configureLogger(config: Pick<Config, 'logLevel' | 'environment'>): void {
  if (!defaultLogger) return;
  // The output format and the production file transports are resolved when the
  // base logger is built, so rebuild it if the environment was not what the
  // process saw at import time (issue #738).
  if (defaultLoggerEnvironment !== config.environment) {
    defaultLogger = new LoggerService();
    defaultLoggerEnvironment = config.environment;
  }
  defaultLogger.setLevel(config.logLevel);
}

export { LoggerService as Logger };
export default getLogger;
