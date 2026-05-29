/**
 * Global Jest setup — runs once after the test framework is installed.
 * Place environment stubs and global mock registrations here.
 */

// ── Environment variables ──────────────────────────────────────────────────
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://traqora:traqora@localhost:5432/traqora_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret';
process.env.STELLAR_NETWORK = 'testnet';
process.env.STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';
process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
process.env.IPFS_GATEWAY = 'https://ipfs.io/ipfs/';

// ── Suppress noisy console output in tests ─────────────────────────────────
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation((...args) => {
    // Suppress known non-critical warnings from ts-jest and typeorm
    const msg = args[0]?.toString() ?? '';
    if (
      msg.includes('ts-jest') ||
      msg.includes('TypeORM') ||
      msg.includes('DeprecationWarning')
    ) return;
    originalWarn(...args);
  });

  jest.spyOn(console, 'error').mockImplementation((...args) => {
    // Let real errors through but suppress expected test errors
    const msg = args[0]?.toString() ?? '';
    if (msg.includes('Expected test error')) return;
    originalError(...args);
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ── Global matchers ────────────────────────────────────────────────────────
expect.extend({
  toBeValidStellarAddress(received: string) {
    const isValid = /^G[A-Z2-7]{55}$/.test(received);
    return {
      pass: isValid,
      message: () =>
        isValid
          ? `Expected ${received} NOT to be a valid Stellar address`
          : `Expected ${received} to be a valid Stellar address (starts with G, 56 chars)`,
    };
  },

  toBeValidStripeId(received: string, prefix: 'pi' | 're' | 'cs' | 'cus') {
    const isValid = received.startsWith(`${prefix}_`);
    return {
      pass: isValid,
      message: () =>
        isValid
          ? `Expected ${received} NOT to be a valid Stripe ${prefix}_ ID`
          : `Expected ${received} to start with "${prefix}_"`,
    };
  },
});

// ── Fake timers default config ─────────────────────────────────────────────
// Individual test files that need fake timers call jest.useFakeTimers() themselves.
// This just sets global defaults so tests are isolated.
afterEach(() => {
  jest.useRealTimers();
});
