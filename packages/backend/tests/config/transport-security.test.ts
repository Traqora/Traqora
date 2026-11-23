import {
  TransportSecurityError,
  TransportSecurityInput,
  enforceTransportSecurity,
  validateTransportSecurity,
} from '../../src/config/transportSecurity';

const secureConfig = (): TransportSecurityInput => ({
  environment: 'production',
  corsOrigin: 'https://app.traqora.com',
  horizonUrl: 'https://horizon.stellar.org',
  sorobanRpcUrl: 'https://soroban-rpc.stellar.org',
  databaseUrl: 'postgresql://user:pass@db.internal:5432/traqora?sslmode=require',
  redisUrl: 'rediss://cache.internal:6379',
  mongoUrl: 'mongodb+srv://cluster.mongodb.net/traqora',
  baseUrl: 'https://api.amadeus.com',
  frontendUrl: 'https://www.traqora.com',
  otlpTraceUrl: 'https://otel.internal:4318/v1/traces',
  enableTracing: true,
});

describe('production transport security (#1186)', () => {
  it('accepts an explicitly TLS-enabled production config', () => {
    expect(validateTransportSecurity(secureConfig())).toEqual([]);
    expect(() => enforceTransportSecurity(secureConfig())).not.toThrow();
  });

  it('accepts equivalent TLS flags for managed storage', () => {
    const config = secureConfig();
    config.databaseUrl = 'postgres://user:pass@db.internal:5432/traqora?sslmode=verify-full';
    config.redisUrl = 'redis://cache.internal:6379?tls=true';
    config.mongoUrl = 'mongodb://mongo.internal:27017/traqora?ssl=true';

    expect(validateTransportSecurity(config)).toEqual([]);
  });

  it('reports every insecure transport in one error', () => {
    const config = secureConfig();
    config.corsOrigin = 'http://app.traqora.com,https://admin.traqora.com';
    config.horizonUrl = 'http://horizon.internal';
    config.databaseUrl = 'postgres://user:pass@db.internal:5432/traqora';
    config.redisUrl = 'redis://cache.internal:6379';
    config.mongoUrl = 'mongodb://mongo.internal:27017/traqora';
    config.otlpTraceUrl = 'http://otel.internal:4318/v1/traces';

    const issues = validateTransportSecurity(config);

    expect(issues).toEqual([
      'CORS_ORIGIN must use https in production or staging',
      'HORIZON_URL must use https in production or staging',
      'DATABASE_URL must use postgres or postgresql with sslmode=require, verify-ca, or verify-full',
      'REDIS_URL must use rediss or set ssl=true or tls=true',
      'MONGO_URI must use mongodb+srv or set tls=true or ssl=true',
      'OTLP_TRACE_URL must use https in production or staging',
    ]);

    let thrown: unknown;
    try {
      enforceTransportSecurity(config);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(TransportSecurityError);
    expect((thrown as TransportSecurityError).issues).toEqual(issues);
  });

  it('skips disabled optional transports', () => {
    const config = secureConfig();
    config.mongoUrl = undefined;
    config.baseUrl = undefined;
    config.frontendUrl = undefined;
    config.enableTracing = false;
    config.otlpTraceUrl = 'http://localhost:4318/v1/traces';

    expect(validateTransportSecurity(config)).toEqual([]);
  });

  it('does not constrain development or test environments', () => {
    const config = secureConfig();
    config.environment = 'development';
    config.databaseUrl = 'sqlite::memory:';
    config.redisUrl = 'redis://localhost:6379';
    config.otlpTraceUrl = 'http://localhost:4318/v1/traces';

    expect(validateTransportSecurity(config)).toEqual([]);
  });

  it('checks staging with the same rules as production', () => {
    const config = secureConfig();
    config.environment = 'staging';
    config.databaseUrl = 'postgresql://user:pass@db.internal:5432/traqora';

    expect(validateTransportSecurity(config)).toEqual([
      'DATABASE_URL must use postgres or postgresql with sslmode=require, verify-ca, or verify-full',
    ]);
  });
});
