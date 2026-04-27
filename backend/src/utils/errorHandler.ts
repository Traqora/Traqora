import { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { mapStellarError } from './stellarErrors';
import { AppError } from '../services/ErrorHandlingService';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
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

  const statusCode = appError.statusCode;
  const stellarMapping = mapStellarError(err);
  const message =
    stellarMapping?.message || appError.message || 'Internal Server Error';
  const code = stellarMapping?.code || appError.code || 'INTERNAL_ERROR';
  const details =
    stellarMapping?.details ||
    appError.details ||
    (process.env.NODE_ENV === 'development' ? { stack: err.stack } : undefined);
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

  if (retryAfterMs && retryAfterMs > 0) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000).toString());
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      retryable,
      requestId,
      timestamp: new Date().toISOString(),
      ...(retryAfterMs ? { retryAfterMs } : {}),
      ...(details ? { details } : {}),
    },
  });
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
