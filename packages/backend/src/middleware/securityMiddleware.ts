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
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://horizon.stellar.org", "https://horizon-testnet.stellar.org"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'self'", "https://js.stripe.com"],
        upgradeInsecureRequests: [],
      },
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
    
    // Ensure HSTS is explicitly set (helmet sets it by default but we can be explicit)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    next();
  },
];
