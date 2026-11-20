import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';
import { AppError } from '../services/ErrorHandlingService';

function toValidationDetails(error: any): unknown {
  if (error && typeof error.flatten === 'function') return error.flatten();
  return error?.issues || error;
}

function validationError(error: any): AppError {
  return new AppError('Validation error', {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    details: toValidationDetails(error),
    retryable: false,
  });
}

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return next(validationError(parsed.error));
    }
    req.body = parsed.data;
    next();
  };
}

export function validateParams(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      return next(validationError(parsed.error));
    }
    req.params = parsed.data as any;
    next();
  };
}

export function validateQuery(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      return next(validationError(parsed.error));
    }
    req.query = parsed.data as any;
    next();
  };
}
