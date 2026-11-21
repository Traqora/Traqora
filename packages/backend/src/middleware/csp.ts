// src/middleware/csp.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { config } from '../config';

// CSP directives with a nonce placeholder. These replace the previous helmet
// directives so cspMiddleware is the single owner of the CSP header.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'nonce-${nonce}'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "connect-src 'self' https://horizon.stellar.org https://horizon-testnet.stellar.org https://soroban-rpc.stellar.org https://soroban-testnet.stellar.org",
  "font-src 'self' https://fonts.gstatic.com",
  "object-src 'none'",
  "media-src 'self'",
  "frame-src 'self' https://js.stripe.com",
  "upgrade-insecure-requests",
];

export function buildCspHeader(nonce: string, directives: readonly string[] = CSP_DIRECTIVES): string {
  return directives.map((directive) => directive.replace('${nonce}', nonce)).join('; ');
}

/**
 * CSP middleware. Generates a per-request nonce, stores it on `res.locals.cspNonce`
 * for use in template rendering, and sets a Content-Security-Policy header.
 * By default the header is report only. Production must set
 * `CSP_REPORT_ONLY=false` to enforce it.
 */
export function createCspMiddleware(
  isReportOnly: () => boolean = () => config.cspReportOnly,
) {
  return function cspMiddleware(req: Request, res: Response, next: NextFunction) {
    const nonce = crypto.randomBytes(16).toString('base64');
    const locals = res.locals as Record<string, unknown>;
    locals.cspNonce = nonce;

    const headerValue = buildCspHeader(nonce);
    const headerName = isReportOnly() ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    res.setHeader(headerName, headerValue);

    if (req.method === 'POST' && req.path === '/csp-report') {
      res.status(204).end();
      return;
    }
    next();
  };
}

export const cspMiddleware = createCspMiddleware();
