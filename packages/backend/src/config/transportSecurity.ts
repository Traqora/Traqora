/**
 * Production transport assertions (#1186).
 *
 * These checks are configuration-level only. They prove that URLs are
 * explicitly configured for TLS, not that the remote service actually presents
 * a valid certificate or that a managed provider has encryption at rest
 * enabled. Those remain deployment checklist items.
 */

export interface TransportSecurityInput {
  environment: string;
  corsOrigin: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
  databaseUrl: string;
  redisUrl: string;
  mongoUrl?: string;
  baseUrl?: string;
  frontendUrl?: string;
  otlpTraceUrl: string;
  enableTracing?: boolean;
}

export class TransportSecurityError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Insecure production transport configuration: ${issues.join('; ')}`);
    this.name = 'TransportSecurityError';
  }
}

const TRUTHY = new Set(['true', '1', 'yes']);
const POSTGRES_TLS_MODES = new Set(['require', 'verify-ca', 'verify-full']);

export const isProdOrStaging = (environment: string | undefined): boolean =>
  environment === 'production' || environment === 'staging';

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isTruthy = (value: string | null): boolean =>
  value !== null && TRUTHY.has(value.toLowerCase());

const assertHttps = (name: string, value: string | undefined, issues: string[]) => {
  if (!value) return;
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:') {
    issues.push(`${name} must use https in production or staging`);
  }
};

const assertPostgresTls = (value: string): boolean => {
  const url = parseUrl(value);
  if (!url || !['postgres:', 'postgresql:'].includes(url.protocol)) return false;

  const sslMode = url.searchParams.get('sslmode')?.toLowerCase() ?? '';
  return POSTGRES_TLS_MODES.has(sslMode) || isTruthy(url.searchParams.get('ssl'));
};

const assertRedisTls = (value: string): boolean => {
  const url = parseUrl(value);
  if (!url || !['redis:', 'rediss:'].includes(url.protocol)) return false;

  return (
    url.protocol === 'rediss:' ||
    isTruthy(url.searchParams.get('ssl')) ||
    isTruthy(url.searchParams.get('tls'))
  );
};

const assertMongoTls = (value: string): boolean => {
  const url = parseUrl(value);
  if (!url || !['mongodb:', 'mongodb+srv:'].includes(url.protocol)) return false;

  return (
    url.protocol === 'mongodb+srv:' ||
    isTruthy(url.searchParams.get('ssl')) ||
    isTruthy(url.searchParams.get('tls'))
  );
};

/** Return every insecure transport setting. Empty means the config is safe. */
export const validateTransportSecurity = (input: TransportSecurityInput): string[] => {
  if (!isProdOrStaging(input.environment)) return [];

  const issues: string[] = [];

  for (const origin of input.corsOrigin.split(',').map((value) => value.trim())) {
    assertHttps('CORS_ORIGIN', origin, issues);
  }
  assertHttps('HORIZON_URL', input.horizonUrl, issues);
  assertHttps('SOROBAN_RPC_URL', input.sorobanRpcUrl, issues);
  assertHttps('FRONTEND_URL', input.frontendUrl, issues);
  assertHttps('AMADEUS_BASE_URL', input.baseUrl, issues);

  if (!assertPostgresTls(input.databaseUrl)) {
    issues.push(
      'DATABASE_URL must use postgres or postgresql with sslmode=require, verify-ca, or verify-full',
    );
  }
  if (!assertRedisTls(input.redisUrl)) {
    issues.push('REDIS_URL must use rediss or set ssl=true or tls=true');
  }
  if (input.mongoUrl && !assertMongoTls(input.mongoUrl)) {
    issues.push('MONGO_URI must use mongodb+srv or set tls=true or ssl=true');
  }
  if (input.enableTracing) {
    assertHttps('OTLP_TRACE_URL', input.otlpTraceUrl, issues);
  }

  return issues;
};

/** Throw when any production or staging transport setting is insecure. */
export const enforceTransportSecurity = (input: TransportSecurityInput): void => {
  const issues = validateTransportSecurity(input);
  if (issues.length > 0) {
    throw new TransportSecurityError(issues);
  }
};
