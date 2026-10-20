import { loadConfig } from '../src/config';
import { configSchema } from '../src/config/schema';
import { logger } from '../src/utils/logger';

describe('Configuration Security Enforcements', () => {
  let exitSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation((msg: any) => logger);
    
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.ADMIN_API_KEY;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.BOOKING_CONTRACT_ID;
    delete process.env.AIRLINE_CONTRACT_ID;
    delete process.env.REFUND_CONTRACT_ID;
    delete process.env.LOYALTY_CONTRACT_ID;
    delete process.env.GOVERNANCE_CONTRACT_ID;
    delete process.env.TOKEN_CONTRACT_ID;
    delete process.env.FLIGHT_REGISTRY_CONTRACT_ID;
    delete process.env.STELLAR_SECRET_KEY;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
    delete process.env.TRACING_SAMPLE_RATE;
    delete process.env.FRONTEND_URL;
    delete process.env.CSP_REPORT_ONLY;
  });

  afterEach(() => {
    exitSpy.mockRestore();
    loggerErrorSpy.mockRestore();
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    delete process.env.ADMIN_API_KEY;
    delete process.env.ENCRYPTION_KEY;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.BOOKING_CONTRACT_ID;
    delete process.env.AIRLINE_CONTRACT_ID;
    delete process.env.REFUND_CONTRACT_ID;
    delete process.env.LOYALTY_CONTRACT_ID;
    delete process.env.GOVERNANCE_CONTRACT_ID;
    delete process.env.TOKEN_CONTRACT_ID;
    delete process.env.FLIGHT_REGISTRY_CONTRACT_ID;
    delete process.env.STELLAR_SECRET_KEY;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.JWT_REFRESH_EXPIRES_IN;
    delete process.env.TRACING_SAMPLE_RATE;
    delete process.env.FRONTEND_URL;
    delete process.env.CSP_REPORT_ONLY;
  });

  it('should successfully load config in development mode with dev defaults', async () => {
    process.env.NODE_ENV = 'development';
    
    const config = await loadConfig();
    expect(config.environment).toBe('development');
    expect(config.jwtSecret).toBe('your-secret-key-change-in-production-at-least-32-chars');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should terminate the process in production mode if JWT_SECRET is missing', async () => {
    process.env.NODE_ENV = 'production';
    
    await expect(loadConfig()).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('should terminate the process in production mode if insecure default JWT_SECRET is used', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'your-secret-key-change-in-production-at-least-32-chars';
    process.env.JWT_REFRESH_SECRET = 'a-strong-and-secure-custom-refresh-secret-here-32-chars';
    process.env.ADMIN_API_KEY = 'a-strong-and-secure-custom-admin-key-here-16-chars';
    process.env.ENCRYPTION_KEY = 'a-strong-and-secure-custom-encryption-key-here-32-chars';

    await expect(loadConfig()).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('should terminate the process in production mode if insecure default ENCRYPTION_KEY is used', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-and-secure-custom-jwt-secret-here-32-chars';
    process.env.JWT_REFRESH_SECRET = 'a-strong-and-secure-custom-refresh-secret-here-32-chars';
    process.env.ADMIN_API_KEY = 'a-strong-and-secure-custom-admin-key-here-16-chars';
    process.env.ENCRYPTION_KEY = 'dev-encryption-key-at-least-32-chars-long';

    await expect(loadConfig()).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  it('should load config successfully in production mode with unique, production-grade secrets', async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'a-strong-and-secure-custom-jwt-secret-here-32-chars';
    process.env.JWT_REFRESH_SECRET = 'a-strong-and-secure-custom-refresh-secret-here-32-chars';
    process.env.ADMIN_API_KEY = 'a-strong-and-secure-custom-admin-key-here-16-chars';
    process.env.ENCRYPTION_KEY = 'a-strong-and-secure-custom-encryption-key-here-32-chars';

    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.BOOKING_CONTRACT_ID = 'CBOOKING';
    process.env.AIRLINE_CONTRACT_ID = 'CAIRLINE';
    process.env.REFUND_CONTRACT_ID = 'CREFUND';
    process.env.LOYALTY_CONTRACT_ID = 'CLOYALTY';
    process.env.GOVERNANCE_CONTRACT_ID = 'CGOV';
    process.env.TOKEN_CONTRACT_ID = 'CTOKEN';
    process.env.FLIGHT_REGISTRY_CONTRACT_ID = 'CREG';

    const config = await loadConfig();
    expect(config.environment).toBe('production');
    expect(config.jwtSecret).toBe('a-strong-and-secure-custom-jwt-secret-here-32-chars');
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('should reject invalid Stellar secret key format via schema', () => {
    expect(() => configSchema.parse({
      stellarSecretKey: 'invalid-key-format',
    })).toThrow('Invalid Stellar secret key format');
  });

  it('should reject invalid JWT expiry duration format via schema', () => {
    expect(() => configSchema.parse({
      jwtExpiresIn: 'invalid',
    })).toThrow('Must be a valid duration');
  });

  it('should reject DEFAULT_ID as a contract ID via schema', () => {
    expect(() => configSchema.parse({
      contracts: { booking: 'DEFAULT_ID' },
    })).toThrow('Booking contract ID must not be the placeholder DEFAULT_ID');
  });

  it('should reject tracing sample rate outside [0, 1] via schema', () => {
    expect(() => configSchema.parse({
      tracingSampleRate: 999,
    })).toThrow();
  });

  it('should load tier quotas from config in development mode', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'sqlite::memory:';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.BOOKING_CONTRACT_ID = 'CBOOKING';
    process.env.AIRLINE_CONTRACT_ID = 'CAIRLINE';
    process.env.REFUND_CONTRACT_ID = 'CREFUND';
    process.env.LOYALTY_CONTRACT_ID = 'CLOYALTY';
    process.env.GOVERNANCE_CONTRACT_ID = 'CGOV';
    process.env.TOKEN_CONTRACT_ID = 'CTOKEN';
    process.env.FLIGHT_REGISTRY_CONTRACT_ID = 'CREG';
    process.env.RATE_LIMIT_FREE_PER_MIN = '200';

    await loadConfig();

    const { buildTierQuotas } = require('../src/config/tiers');
    expect(buildTierQuotas().free.perMinute).toBe(200);
  });
});
