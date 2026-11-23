// @ts-ignore
import { Request, Response, NextFunction } from 'express';
// @ts-ignore
import { z } from 'zod';
import { challengeSchema, verifySchema, refreshSchema, createBookingSchema, createRefundSchema } from '../api/schemas';

// @ts-ignore
import type { ZodTypeAny } from 'zod';

// Map paths to their corresponding zod schemas
const schemaMap: Record<string, z.ZodTypeAny> = {
  '/api/v1/auth/challenge': challengeSchema,
  '/api/v1/auth/verify': verifySchema,
  '/api/v1/auth/refresh': refreshSchema,
  '/api/v1/bookings': createBookingSchema,
  '/api/v1/refunds/request': createRefundSchema,
};

export const validateRequest = (path: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const schema = schemaMap[path];
    
    if (!schema) {
      // No validation schema for this path, skip validation
      return next();
    }
    
    try {
      // Validate request body
      if (req.body && Object.keys(req.body).length > 0) {
        schema.parse(req.body);
      }
      
      // For GET requests, validate query parameters if needed
      if (req.method === 'GET' && req.query && Object.keys(req.query).length > 0) {
        // TODO: Add query parameter validation logic
      }
      
      next();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        // Return standardized error format matching existing error handler
        return res.status(400).json({
          success: false,
          error: {
            message: 'Validation error',
            code: 'VALIDATION_ERROR',
            details: error.issues,
            retryable: false,
            requestId: String(res.locals.requestId || 'unknown'),
            timestamp: new Date().toISOString(),
          },
        });
      }
      
      next(error);
    }
  };
};

// Helper function to get schema for a specific path
export const getSchemaForPath = (path: string): z.ZodTypeAny | undefined => {
  return schemaMap[path];
};
