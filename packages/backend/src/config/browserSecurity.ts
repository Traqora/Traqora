/**
 * Browser origin and header policy helpers (#1183).
 *
 * CORS and WebSocket access use the same allowlist. Production and staging
 * require explicit HTTPS origins and enforced CSP so a localhost default or a
 * report-only header cannot silently ship.
 */

export interface CorsOriginConfig {
  corsOrigin: string;
  corsAllowedOrigins?: readonly string[];
}

export interface BrowserSecurityConfig extends CorsOriginConfig {
  environment?: string;
  cspReportOnly?: boolean;
}

export function parseCorsAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function resolveCorsAllowedOrigins(config: CorsOriginConfig): string[] {
  const configured = config.corsAllowedOrigins?.length
    ? config.corsAllowedOrigins
    : [config.corsOrigin];

  return Array.from(
    new Set(
      configured
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  );
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

export function assertBrowserSecurityConfiguration(config: BrowserSecurityConfig): void {
  if (config.environment !== 'production' && config.environment !== 'staging') {
    return;
  }

  const issues: string[] = [];
  const origins = resolveCorsAllowedOrigins(config);

  if (origins.length === 0) {
    issues.push('CORS_ALLOWED_ORIGINS must contain at least one HTTPS origin');
  }

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      issues.push(`CORS origin is not a valid URL: ${origin}`);
      continue;
    }

    if (parsed.protocol !== 'https:') {
      issues.push(`CORS origin must use HTTPS: ${origin}`);
    }
    if (parsed.host === '*' || origin === '*') {
      issues.push('Wildcard CORS origins are not allowed');
    }
    if (isLoopbackOrigin(origin)) {
      issues.push(`Loopback CORS origins are not allowed: ${origin}`);
    }
  }

  if (config.cspReportOnly !== false) {
    issues.push('CSP_REPORT_ONLY must be false so Content-Security-Policy is enforced');
  }

  if (issues.length > 0) {
    throw new Error(`Invalid browser security configuration: ${issues.join(' ')}`);
  }
}

export function corsOriginMatcher(
  allowedOrigins: readonly string[],
): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  const allowlist = new Set(allowedOrigins);

  return (origin, callback) => {
    if (!origin || !allowlist.has(origin)) {
      return callback(null, false);
    }
    return callback(null, true);
  };
}
