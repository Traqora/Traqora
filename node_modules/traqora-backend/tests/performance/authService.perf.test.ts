/**
 * Performance regression tests for AuthService.
 * Measures critical auth paths: challenge generation, signature verification,
 * token issuance, biometric registration, and biometric authentication.
 */

import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
import RedisMock from 'ioredis-mock';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import { measurePerf, assertPerfThresholds } from './perf-utils';

jest.mock('ioredis', () => {
  const RedisMock = require('ioredis-mock');
  return {
    __esModule: true,
    default: RedisMock,
    Redis: RedisMock,
  };
});

jest.mock('../../src/services/WalletSignatureAdapter', () => {
  const { WalletAuthFactory: actual } = jest.requireActual('../../src/services/WalletSignatureAdapter');
  return {
    WalletAuthFactory: {
      getAdapter: jest.fn().mockReturnValue({
        verify: jest.fn().mockResolvedValue(true),
      }),
    },
  };
});

const WALLET_ADDR = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

describe('AuthService Performance', () => {
  let authService: AuthService;
  let mockRepo: any;
  let mockRedis: any;

  beforeAll(() => {
    mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const ds = { getRepository: jest.fn().mockReturnValue(mockRepo) } as unknown as DataSource;
    authService = new AuthService(ds);
    mockRedis = new RedisMock();
    (authService as any).redis = mockRedis;
  });

  afterAll(async () => {
    await authService.disconnect();
  });

  beforeEach(async () => {
    await mockRedis.flushall();
    jest.clearAllMocks();
  });

  describe('generateChallenge', () => {
    it('should generate challenge within 50ms', async () => {
      const stats = await measurePerf(() => authService.generateChallenge(WALLET_ADDR), 25);
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('verifySignature', () => {
    beforeEach(async () => {
      await mockRedis.set(`auth:nonce:${WALLET_ADDR}`, 'test-nonce', 'EX', 300);
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue({ walletAddress: WALLET_ADDR, walletType: 'freighter' });
      mockRepo.save.mockResolvedValue({ walletAddress: WALLET_ADDR, walletType: 'freighter' });
    });

    it('should verify signature and issue tokens within 100ms', async () => {
      const stats = await measurePerf(
        () => authService.verifySignature(WALLET_ADDR, 'valid-sig', 'freighter'),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 100, maxMs: 200 });
    });
  });

  describe('issueTokens', () => {
    it('should issue token pair within 50ms', async () => {
      const stats = await measurePerf(
        () => authService.issueTokens(WALLET_ADDR, 'freighter'),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('refreshTokens', () => {
    let refreshToken: string;

    beforeEach(async () => {
      refreshToken = jwt.sign(
        { walletAddress: WALLET_ADDR },
        config.jwtRefreshSecret,
        { subject: WALLET_ADDR }
      );
      const crypto = require('crypto');
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await mockRedis.set(`auth:refresh:${WALLET_ADDR}`, hash);
      mockRepo.findOne.mockResolvedValue({ walletAddress: WALLET_ADDR, walletType: 'freighter' });
    });

    it('should refresh tokens within 100ms', async () => {
      const stats = await measurePerf(() => authService.refreshTokens(refreshToken), 20);
      assertPerfThresholds(stats, { meanMaxMs: 100, maxMs: 200 });
    });
  });

  describe('biometric registration', () => {
    const cred = {
      id: 'perf-cred-id',
      rawId: Buffer.from('perf-cred').toString('base64'),
      type: 'public-key' as const,
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create' })).toString('base64url'),
        attestationObject: Buffer.from(JSON.stringify({ fmt: 'none', attStmt: {} })).toString('base64url'),
        transports: ['internal'] as any,
      },
    };

    beforeEach(async () => {
      await mockRedis.set(`webauthn:reg:${WALLET_ADDR}`, Buffer.from('challenge').toString('base64url'));
      mockRepo.findOne.mockResolvedValue(null);
      mockRepo.create.mockReturnValue({});
      mockRepo.save.mockResolvedValue({});
    });

    it('should register biometric credential within 50ms', async () => {
      const stats = await measurePerf(
        () => authService.registerBiometricCredential(WALLET_ADDR, cred, 'Perf Device'),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('biometric authentication', () => {
    const assertion = {
      id: 'perf-cred-id',
      rawId: 'perf-raw-id',
      type: 'public-key' as const,
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get' })).toString('base64url'),
        authenticatorData: 'dGVzdC1hdXRoLWRhdGE',
        signature: Buffer.from('fake-sig').toString('base64'),
      },
    };

    beforeEach(async () => {
      await mockRedis.set(`webauthn:auth:${WALLET_ADDR}`, Buffer.from('challenge').toString('base64url'));
      mockRepo.findOne.mockResolvedValue({
        id: 'perf-cred-id',
        credentialId: 'perf-cred-id',
        walletAddress: WALLET_ADDR,
        isActive: true,
        publicKey: Buffer.from(JSON.stringify({ fmt: 'none' })).toString('base64'),
        counter: 0,
      });
      mockRepo.save.mockResolvedValue({});
    });

    it('should verify biometric assertion within 50ms', async () => {
      const stats = await measurePerf(
        () => authService.verifyBiometricAssertion(WALLET_ADDR, assertion),
        10
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('biometric payment authorization', () => {
    const assertion = {
      id: 'perf-cred-id',
      rawId: 'perf-raw-id',
      type: 'public-key' as const,
      response: {
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get' })).toString('base64url'),
        authenticatorData: 'dGVzdC1hdXRoLWRhdGE',
        signature: Buffer.from('fake-sig').toString('base64'),
      },
    };

    beforeEach(async () => {
      await mockRedis.set(`webauthn:auth:${WALLET_ADDR}`, Buffer.from('challenge').toString('base64url'));
      mockRepo.findOne.mockResolvedValue({
        id: 'perf-cred',
        credentialId: 'perf-cred-id',
        walletAddress: WALLET_ADDR,
        isActive: true,
        publicKey: Buffer.from(JSON.stringify({ fmt: 'none' })).toString('base64'),
        counter: 0,
      });
      mockRepo.save.mockResolvedValue({});
    });

    it('should authorize payment within 50ms', async () => {
      const stats = await measurePerf(
        () => authService.authorizePaymentWithBiometric(
          WALLET_ADDR,
          assertion,
          { amount: '100', destination: 'GDESTPERF' }
        ),
        10
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('biometric fallback', () => {
    beforeEach(() => {
      mockRepo.find.mockResolvedValue([
        { id: 'cred-1', walletAddress: WALLET_ADDR, isActive: true },
      ]);
    });

    it('should generate fallback challenge within 50ms', async () => {
      const stats = await measurePerf(
        () => authService.generateBiometricFallbackChallenge(WALLET_ADDR),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });

    it('should verify fallback signature within 100ms', async () => {
      const nonce = 'perf-fallback-nonce';
      await mockRedis.set(`auth:biometric:fallback:${WALLET_ADDR}`, nonce);
      mockRepo.findOne.mockResolvedValue({ walletAddress: WALLET_ADDR, walletType: 'freighter' });

      const stats = await measurePerf(
        () => authService.verifyBiometricFallback(WALLET_ADDR, 'valid-sig', 'freighter'),
        20
      );
      assertPerfThresholds(stats, { meanMaxMs: 100, maxMs: 200 });
    });
  });

  describe('credential management', () => {
    it('should list credentials within 50ms', async () => {
      mockRepo.find.mockResolvedValue([
        { id: 'c1', credentialId: 'c1', credentialType: 'fingerprint', deviceName: 'Device', createdAt: new Date(), lastUsedAt: new Date(), walletAddress: WALLET_ADDR, isActive: true },
      ]);

      const stats = await measurePerf(
        () => authService.getBiometricCredentials(WALLET_ADDR),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });

    it('should soft-delete credential within 50ms', async () => {
      mockRepo.findOne.mockResolvedValue({ id: 'c1', walletAddress: WALLET_ADDR });
      mockRepo.save.mockResolvedValue({});

      const stats = await measurePerf(
        () => authService.removeBiometricCredential('c1', WALLET_ADDR),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 50, maxMs: 100 });
    });
  });

  describe('payment token redemption', () => {
    it('should redeem payment token within 20ms', async () => {
      const token = 'perf-payment-token';
      await mockRedis.set(
        `payment:auth:${token}`,
        JSON.stringify({ walletAddress: WALLET_ADDR, amount: '50', destination: 'GDEST' })
      );

      const stats = await measurePerf(
        () => authService.redeemPaymentToken(token, WALLET_ADDR),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 20, maxMs: 50 });
    });

    it('should return null for missing token within 10ms', async () => {
      const stats = await measurePerf(
        () => authService.redeemPaymentToken('nonexistent', WALLET_ADDR),
        25
      );
      assertPerfThresholds(stats, { meanMaxMs: 10, maxMs: 30 });
    });
  });
});
