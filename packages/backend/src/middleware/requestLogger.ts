import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger, asyncLocalStorage } from '../utils/logger';
import { isSensitiveKey, redactValue, REDACTED } from '../utils/structuredLogger';

/**
 * Substring list of the redacted key names. Canonical definition lives in
 * `utils/structuredLogger` so the loggers and this middleware cannot drift
 * (issue #738); re-exported here for existing importers.
 */
export const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'api-key',
  'jwt',
  'refresh_token',
];

export const sanitizeObject = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  return redactValue(value);
};

const sanitizeHeaders = (headers: Request['headers']) => {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isSensitiveKey(key)) {
      sanitized[key] = REDACTED;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();
  const requestId = correlationId;
  const store = new Map<string, string>();
  store.set('correlationId', correlationId);
  store.set('requestId', requestId);

  asyncLocalStorage.run(store, () => {
    const start = process.hrtime.bigint();
    res.locals.requestId = requestId;

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
        requestId,
        correlationId,
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
