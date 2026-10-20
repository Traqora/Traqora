import { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { mapStellarError } from './stellarErrors';
import { AppError } from '../services/ErrorHandlingService';
import { captureException } from '../services/errorTracking';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

export interface RFC7807Error {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code?: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
  requestId?: string;
  timestamp?: string;
}

const errorTypeMap: Record<string, { type: string; title: string }> = {
  BAD_REQUEST: {
    type: 'https://traqora.com/errors/bad-request',
    title: 'Bad Request',
  },
  UNAUTHORIZED: {
    type: 'https://traqora.com/errors/unauthorized',
    title: 'Unauthorized',
  },
  FORBIDDEN: {
    type: 'https://traqora.com/errors/forbidden',
    title: 'Forbidden',
  },
  NOT_FOUND: {
    type: 'https://traqora.com/errors/not-found',
    title: 'Not Found',
  },
  CONFLICT: {
    type: 'https://traqora.com/errors/conflict',
    title: 'Conflict',
  },
  UNPROCESSABLE_ENTITY: {
    type: 'https://traqora.com/errors/unprocessable-entity',
    title: 'Unprocessable Entity',
  },
  TOO_MANY_REQUESTS: {
    type: 'https://traqora.com/errors/rate-limit',
    title: 'Too Many Requests',
  },
  INTERNAL_ERROR: {
    type: 'https://traqora.com/errors/internal',
    title: 'Internal Server Error',
  },
  UPSTREAM_UNAVAILABLE: {
    type: 'https://traqora.com/errors/upstream-unavailable',
    title: 'Upstream Unavailable',
  },
  CIRCUIT_OPEN: {
    type: 'https://traqora.com/errors/circuit-open',
    title: 'Service Temporarily Unavailable',
  },
  PARTIAL_FAILURE_RECOVERED: {
    type: 'https://traqora.com/errors/partial-failure',
    title: 'Partial Failure Recovered',
  },
};

function getErrorType(code: string): { type: string; title: string } {
  return errorTypeMap[code] || errorTypeMap.INTERNAL_ERROR;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) => {
  const appError =
    err instanceof AppError
      ? err
      : new AppError(err.message || 'Internal Server Error', {
          statusCode: err.statusCode || 500,
          code: err.code || 'INTERNAL_ERROR',
          details: err.details,
          retryable: err.retryable,
          retryAfterMs: err.retryAfterMs,
        });

  const stellarMapping = mapStellarError(err);
  const statusCode = stellarMapping?.statusCode || appError.statusCode;
  const message = stellarMapping?.message || appError.message || 'Internal Server Error';
  const code = stellarMapping?.code || appError.code || 'INTERNAL_ERROR';
  const details = stellarMapping?.details || appError.details || (process.env.NODE_ENV === 'development' ? { stack: err.stack } : undefined);
  const retryable = appError.retryable || false;
  const retryAfterMs = appError.retryAfterMs;
  const requestId = String(res.locals.requestId || 'unknown');
  const userId = req.user?.walletAddress || 'anonymous';
  const operation = `${req.method} ${req.originalUrl || req.path}`;

  logger.error({
    error: appError.message,
    stack: err.stack,
    code: appError.code,
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId,
    operation,
    requestId,
    retryable,
    retryAfterMs,
  });

  if (statusCode >= 500) {
    captureException(err, {
      requestId,
      userId,
      path: req.path,
      method: req.method,
      tags: { code: appError.code },
    });
  }

  if (retryAfterMs && retryAfterMs > 0) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
  }

  const { type, title } = getErrorType(code);
  const instance = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

  const rfc7807Error: RFC7807Error = {
    type,
    title,
    status: statusCode,
    detail: message,
    instance,
    code,
    details: details || null,
    retryable,
    retryAfterMs,
    requestId,
    timestamp: new Date().toISOString(),
  };

  // Set RFC 7807 content type
  res.setHeader('Content-Type', 'application/problem+json');

  res.status(statusCode).json(rfc7807Error);
};

type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<unknown>;

export const asyncHandler = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};