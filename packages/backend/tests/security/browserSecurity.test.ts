// @ts-ignore
import cors from 'cors';
import express from 'express';
import request from 'supertest';
import {
  assertBrowserSecurityConfiguration,
  corsOriginMatcher,
  parseCorsAllowedOrigins,
  resolveCorsAllowedOrigins,
} from '../../src/config/browserSecurity';
import { securityMiddleware } from '../../src/middleware/securityMiddleware';
import { createCspMiddleware } from '../../src/middleware/csp';

describe('browser origin configuration (#1183)', () => {
  describe('parseCorsAllowedOrigins', () => {
    it('splits, trims and ignores empty comma-separated origins', () => {
      expect(
        parseCorsAllowedOrigins(' https://app.example.com , ,https://admin.example.com/ '),
      ).toEqual(['https://app.example.com', 'https://admin.example.com/']);
    });

    it('returns an empty list when the variable is unset', () => {
      expect(parseCorsAllowedOrigins(undefined)).toEqual([]);
    });
  });

  describe('resolveCorsAllowedOrigins', () => {
    it('prefers the allowlist and falls back to the legacy single origin', () => {
      expect(
        resolveCorsAllowedOrigins({
          corsOrigin: 'http://localhost:3000',
          corsAllowedOrigins: ['https://app.example.com'],
        }),
      ).toEqual(['https://app.example.com']);
      expect(resolveCorsAllowedOrigins({ corsOrigin: 'http://localhost:3000' })).toEqual([
        'http://localhost:3000',
      ]);
    });
  });

  describe('assertBrowserSecurityConfiguration', () => {
    it('accepts explicit HTTPS origins with enforced CSP in production', () => {
      expect(() =>
        assertBrowserSecurityConfiguration({
          environment: 'production',
          corsOrigin: 'http://localhost:3000',
          corsAllowedOrigins: ['https://app.example.com', 'https://admin.example.com'],
          cspReportOnly: false,
        }),
      ).not.toThrow();
    });

    it('rejects the localhost fallback in production', () => {
      expect(() =>
        assertBrowserSecurityConfiguration({
          environment: 'production',
          corsOrigin: 'http://localhost:3000',
          cspReportOnly: false,
        }),
      ).toThrow(/Loopback CORS origins are not allowed/);
    });

    it('rejects HTTP and wildcard origins in staging', () => {
      expect(() =>
        assertBrowserSecurityConfiguration({
          environment: 'staging',
          corsOrigin: 'http://localhost:3000',
          corsAllowedOrigins: ['http://app.example.com', '*'],
          cspReportOnly: false,
        }),
      ).toThrow(/must use HTTPS|Wildcard CORS origins are not allowed/);
    });

    it('rejects report-only CSP in production', () => {
      expect(() =>
        assertBrowserSecurityConfiguration({
          environment: 'production',
          corsOrigin: 'https://app.example.com',
          cspReportOnly: true,
        }),
      ).toThrow(/CSP_REPORT_ONLY must be false/);
    });

    it('does not constrain development origins', () => {
      expect(() =>
        assertBrowserSecurityConfiguration({
          environment: 'development',
          corsOrigin: 'http://localhost:3000',
          cspReportOnly: true,
        }),
      ).not.toThrow();
    });
  });

  describe('corsOriginMatcher', () => {
    const app = express();
    app.use(
      cors({
        origin: corsOriginMatcher(
          resolveCorsAllowedOrigins({
            corsOrigin: 'http://localhost:3000',
            corsAllowedOrigins: ['https://app.example.com'],
          }),
        ),
        credentials: true,
      }),
    );
    app.get('/ping', (_req, res) => res.json({ ok: true }));

    it('allows only the configured origin', async () => {
      const allowed = await request(app)
        .get('/ping')
        .set('Origin', 'https://app.example.com');
      expect(allowed.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(allowed.headers['access-control-allow-credentials']).toBe('true');

      const denied = await request(app)
        .get('/ping')
        .set('Origin', 'https://evil.example.com');
      expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});

describe('browser security headers (#1183)', () => {
  const buildApp = (reportOnly: boolean) => {
    const app = express();
    app.use(createCspMiddleware(() => reportOnly));
    app.use(securityMiddleware);
    app.get('/ping', (_req, res) => res.json({ ok: true }));
    return app;
  };

  it('enforces a single nonce-based CSP and explicit HSTS when report only is disabled', async () => {
    const res = await request(buildApp(false)).get('/ping');

    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-/);
    expect(res.headers['content-security-policy']).toContain('upgrade-insecure-requests');
    expect(res.headers['content-security-policy-report-only']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['permissions-policy']).toContain('camera=()');
  });

  it('uses only the report-only CSP header when configured for monitoring', async () => {
    const res = await request(buildApp(true)).get('/ping');

    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy-report-only']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).toBeUndefined();
  });
});
