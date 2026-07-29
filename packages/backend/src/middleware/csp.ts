// src/middleware/csp.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Default CSP directives – includes a nonce placeholder
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'nonce-${nonce}'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
];

/**
 * CSP middleware. Generates a per‑request nonce, stores it on `res.locals.cspNonce`
 * for use in template rendering, and sets a Content‑Security‑Policy header.
 * By default the header is **Report‑Only**; set `CSP_REPORT_ONLY=false` to enforce.
 */
export function cspMiddleware(req: Request, res: Response, next: NextFunction) {
  const nonce = crypto.randomBytes(16).toString('base64');
  // expose nonce for templating engines
  (res.locals as any).cspNonce = nonce;

  const headerValue = CSP_DIRECTIVES.map(d => d.replace('${nonce}', nonce)).join('; ');
  const reportOnly = process.env.CSP_REPORT_ONLY !== 'false';
  const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  res.setHeader(headerName, headerValue);

  // simple endpoint to accept violation reports (no processing)
  if (req.method === 'POST' && req.path === '/csp-report') {
    res.status(204).end();
    return;
  }
  next();
}
