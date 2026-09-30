import { captureException } from './sentry';

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ClientLogContext {
  component?: string;
  action?: string;
  resource?: string;
  resourceId?: string;
  durationMs?: number;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = [
  'authorization', 'cookie', 'password', 'token', 'secret',
  'api_key', 'apikey', 'jwt', 'refresh_token', 'credit_card',
  'cvv', 'pin', 'ssn', 'stripe_key',
];

function isSensitive(key: string): boolean {
  return SENSITIVE_KEYS.some((sk) => key.toLowerCase().includes(sk));
}

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitize);
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = isSensitive(key) ? '[REDACTED]' : sanitize(val);
  }
  return redacted;
}

const LOG_LEVELS: Record<ClientLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: ClientLogLevel =
  (typeof process !== 'undefined' && (process as any)?.env?.NEXT_PUBLIC_LOG_LEVEL) as ClientLogLevel
  || (typeof window !== 'undefined' && (window as any).__NEXT_PUBLIC_LOG_LEVEL)
  || 'info';

export class ClientLogger {
  private component: string;
  private defaultContext: ClientLogContext;

  constructor(component: string, defaultContext: ClientLogContext = {}) {
    this.component = component;
    this.defaultContext = defaultContext;
  }

  child(context: ClientLogContext): ClientLogger {
    return new ClientLogger(this.component, { ...this.defaultContext, ...context });
  }

  private shouldLog(level: ClientLogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
  }

  private formatMessage(level: ClientLogLevel, message: string, meta?: ClientLogContext): string {
    const timestamp = new Date().toISOString();
    const ctx = { ...this.defaultContext, ...meta };
    const comp = ctx.component ? ` [${ctx.component}]` : '';
    const extra = Object.keys(ctx).length > 0 ? ` ${JSON.stringify(sanitize(ctx))}` : '';
    return `${timestamp} ${level.toUpperCase()}${comp}: ${message}${extra}`;
  }

  private sendToBackend(level: ClientLogLevel, message: string, meta?: ClientLogContext): void {
    if (typeof fetch === 'undefined') return;
    const payload = {
      level,
      message,
      component: this.component,
      timestamp: new Date().toISOString(),
      ...meta,
    };
    const url = (typeof window !== 'undefined' ? (window as any).__NEXT_PUBLIC_API_URL : '') || '/api/v1';
    fetch(`${url}/client-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sanitize(payload)),
    }).catch(() => {});
  }

  debug(message: string, meta?: ClientLogContext): void {
    if (!this.shouldLog('debug')) return;
    console.debug(this.formatMessage('debug', message, meta));
  }

  info(message: string, meta?: ClientLogContext): void {
    if (!this.shouldLog('info')) return;
    console.info(this.formatMessage('info', message, meta));
  }

  warn(message: string, meta?: ClientLogContext): void {
    if (!this.shouldLog('warn')) return;
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message: string, meta?: ClientLogContext): void {
    if (!this.shouldLog('error')) return;
    console.error(this.formatMessage('error', message, meta));
  }

  captureError(error: unknown, context?: ClientLogContext): void {
    this.error(error instanceof Error ? error.message : String(error), context);
    captureException(error, {
      extra: context ? sanitize(context) as Record<string, unknown> : undefined,
    });
  }

  time<T>(label: string, fn: () => T): T;
  time<T>(label: string, fn: () => Promise<T>): Promise<T>;
  time<T>(label: string, fn: (() => T) | (() => Promise<T>)): T | Promise<T> {
    const start = performance.now();
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        this.info(`${label} completed`, { durationMs: Math.round(performance.now() - start), label });
      }) as Promise<T>;
    }
    this.info(`${label} completed`, { durationMs: Math.round(performance.now() - start), label });
    return result;
  }

  logAudit(action: string, resource: string, resourceId?: string, meta?: ClientLogContext): void {
    this.info(`Audit: ${action} on ${resource}`, {
      ...meta,
      action,
      resource,
      resourceId,
      audit: true,
    });
    this.sendToBackend('info', `Audit: ${action} on ${resource}`, {
      ...meta,
      action,
      resource,
      resourceId,
    });
  }
}

const loggers = new Map<string, ClientLogger>();

export function getLogger(component: string, context?: ClientLogContext): ClientLogger {
  let logger = loggers.get(component);
  if (!logger) {
    logger = new ClientLogger(component, context);
    loggers.set(component, logger);
  }
  return logger;
}

export default getLogger;
