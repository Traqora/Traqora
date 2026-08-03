import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';
import { Config } from '../config/schema';
import { SENSITIVE_KEYS } from '../middleware/requestLogger';

export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

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

function redactSensitive(info: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(info)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value as Record<string, unknown>);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

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

const maskSensitive = winston.format((info) => {
  if (info.body) info.body = redactSensitive(info.body as Record<string, unknown>);
  if (info.headers) info.headers = redactSensitive(info.headers as Record<string, unknown>);
  if (info.details) {
    try {
      const parsed: Record<string, unknown> =
        typeof info.details === 'string' ? JSON.parse(info.details) as Record<string, unknown> : info.details as Record<string, unknown>;
      info.details = JSON.stringify(redactSensitive(parsed));
    } catch {
      /* non-serializable details — skip masking */
    }
  }
  return info;
});

const jsonFormat = winston.format.combine(
  addContext(),
  maskSensitive(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
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
    return {
      ...entry,
      ...this.context,
      correlationId: entry.correlationId || this.context.correlationId,
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
  const transports: winston.transport[] = [
    new winston.transports.Console({
      format: environment === 'development'
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf((info: winston.Logform.TransformableInfo) => {
              const { level, message, timestamp, ...rest } = info;
              const comp = rest.component ? ` [${String(rest.component)}]` : '';
              const corr = rest.correlationId ? ` (${String(rest.correlationId)})` : '';
              const extra = Object.keys(rest).length ? ` ${JSON.stringify(redactSensitive(rest as unknown as Record<string, unknown>))}` : '';
              return `${String(timestamp)} ${String(level)}${comp}${corr}: ${String(message)}${extra}`;
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
    defaultMeta: { service: 'traqora-api' },
    transports,
  });
}

let defaultLogger: LoggerService | null = null;

export function getLogger(context?: LogContext): LoggerService {
  if (!defaultLogger) {
    defaultLogger = new LoggerService();
  }
  return context ? defaultLogger.child(context) : defaultLogger;
}

export function configureLogger(config: Pick<Config, 'logLevel' | 'environment'>): void {
  if (defaultLogger) {
    defaultLogger.setLevel(config.logLevel);
  }
}

export { LoggerService as Logger };
export default getLogger;
