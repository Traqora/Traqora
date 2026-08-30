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

  const stellarMapping = mapStellarError(err);
  // A contract-error mapping (#547) carries its own, more accurate status
  // (e.g. 404 for "booking not found", 409 for an already-processed
  // booking) rather than always falling back to appError's default of 500
  // — that default is correct for the generic, older Stellar/Horizon
  // mappings above it, which never set statusCode.
  const statusCode = stellarMapping?.statusCode || appError.statusCode;
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

  // Only report server-side failures (5xx) to Sentry — 4xx responses are
  // expected client-input errors (validation, auth, not-found) and would
  // otherwise drown out real incidents.
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

  res.status(statusCode).json({
    error: message,
    code,
    details: details || null,
    requestId,
    timestamp: new Date().toISOString(),
    success: false, // Keep for backward compatibility
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
