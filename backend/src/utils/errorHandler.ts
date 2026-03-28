import { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { mapStellarError } from './stellarErrors';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const stellarMapping = mapStellarError(err);
  const message =
    stellarMapping?.message || err.message || 'Internal Server Error';
  const code = stellarMapping?.code || err.code || 'INTERNAL_ERROR';
  const details =
    stellarMapping?.details ||
    err.details ||
    (process.env.NODE_ENV === 'development' ? { stack: err.stack } : undefined);

  logger.error({
    error: err.message,
    stack: err.stack,
    code: err.code,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });

  res.status(statusCode).json({
    error: {
      code,
      message,
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
