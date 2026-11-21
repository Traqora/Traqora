import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/**
 * Enhanced security middleware using Helmet
 * Configures important security headers:
 * - Content-Security-Policy (CSP)
 * - Strict-Transport-Security (HSTS)
 * - X-Frame-Options
 * - X-Content-Type-Options
 * - Referrer-Policy
 */
export const securityMiddleware = [
  // Base helmet configuration
  helmet({
    // cspMiddleware owns CSP so there is exactly one policy header, with a
    // per-request nonce and a mode driven by CSP_REPORT_ONLY.
    contentSecurityPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),

  // Additional security headers not covered by basic helmet
  (req: Request, res: Response, next: NextFunction) => {
    // Set Permissions-Policy
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(self "https://js.stripe.com")'
    );
    
    next();
  },
];
