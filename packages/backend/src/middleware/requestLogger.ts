import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, asyncLocalStorage } from '../utils/logger';

const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'jwt',
  'refresh_token',
];

const redactValue = (value: unknown) => {
  if (value === undefined || value === null) return value;
  return '[REDACTED]';
};

const sanitizeObject = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sanitizeObject);

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(record)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = redactValue(val);
    } else {
      sanitized[key] = sanitizeObject(val);
    }
  }
  return sanitized;
};

const sanitizeHeaders = (headers: Request['headers']) => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const store = new Map<string, string>();
  store.set('correlationId', correlationId);

  asyncLocalStorage.run(store, () => {
    const start = process.hrtime.bigint();
    res.locals.requestId = correlationId;

    const requestSnapshot = {
      method: req.method,
      path: req.originalUrl || req.url,
      headers: sanitizeHeaders(req.headers),
      query: sanitizeObject(req.query),
      body: sanitizeObject(req.body),
    };

    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    const originalSend = res.send.bind(res);
    res.send = (body: unknown) => {
      responseBody = body;
      return originalSend(body);
    };

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const payload: Record<string, unknown> = {
        requestId: correlationId,
        statusCode: res.statusCode,
        durationMs,
        request: requestSnapshot,
      };

      if (res.statusCode >= 400) {
        payload.response = sanitizeObject(responseBody);
      }

      logger.info('http_request', payload);
    });

    next();
  });
};
