import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal, httpRequestErrors } from '../services/metrics';

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Capture the original end function
  const originalEnd = res.end;
  
  // Override the end function to record metrics
  res.end = function(this: Response, ...args: any[]): Response {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    const method = req.method;
    const statusCode = res.statusCode.toString();
    
    // Record metrics
    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestTotal.inc({ method, route, status_code: statusCode });
    
    // Record errors for 4xx and 5xx status codes
    if (res.statusCode >= 400) {
      const errorType = res.statusCode >= 500 ? 'server_error' : 'client_error';
      httpRequestErrors.inc({ method, route, error_type: errorType });
    }
    
    // Call the original end function
    return originalEnd.apply(this, args);
  };
  
  next();
};
