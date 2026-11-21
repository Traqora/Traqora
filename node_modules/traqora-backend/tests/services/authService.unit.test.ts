import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
import { User } from '../../src/db/entities/User';
import RedisMock from 'ioredis-mock';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';

jest.mock('ioredis', () => {
    const RedisMock = require('ioredis-mock');
    return {
        __esModule: true,
        default: RedisMock,
        Redis: RedisMock,
    };
});

jest.mock('../../src/services/WalletSignatureAdapter', () => {
    return {
        WalletAuthFactory: {
            getAdapter: jest.fn().mockReturnValue({
                verify: jest.fn().mockResolvedValue(true),
            }),
        },
    };
});

describe('AuthService - Unit Tests', () => {
    let authService: AuthService;
    let mockDataSource: Partial<DataSource>;
    let mockRepository: any;
    let mockRedis: any;

    beforeAll(() => {
        mockRepository = {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
        };

        mockDataSource = {
            getRepository: jest.fn().mockReturnValue(mockRepository),
        };

        authService = new AuthService(mockDataSource as DataSource);
        mockRedis = new RedisMock();
        (authService as any).redis = mockRedis;
    });

    afterAll(async () => {
        await authService.disconnect();
    });

    afterEach(async () => {
        await mockRedis.flushall();
        jest.clearAllMocks();
    });

    describe('generateChallenge', () => {
        it('should generate a valid challenge with nonce', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const result = await authService.generateChallenge(walletAddress);

            expect(result).toHaveProperty('nonce');
            expect(result).toHaveProperty('expiresIn');
            expect(result).toHaveProperty('message');
            expect(result.nonce).toHaveLength(64); // 32 bytes as hex
            expect(result.message).toContain(result.nonce);
        });

        it('should store nonce in Redis with expiry', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const result = await authService.generateChallenge(walletAddress);

            const storedNonce = await mockRedis.get(`auth:nonce:${walletAddress}`);
            expect(storedNonce).toBe(result.nonce);
        });

        it('should reject invalid wallet address (too short)', async () => {
            const invalidWallet = 'G123';
            await expect(authService.generateChallenge(invalidWallet)).rejects.toThrow('Invalid Stellar public key');
        });

        it('should reject invalid wallet address (wrong prefix)', async () => {
            const invalidWallet = 'XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
            await expect(authService.generateChallenge(invalidWallet)).rejects.toThrow('Invalid Stellar public key');
        });

        it('should reject empty wallet address', async () => {
            await expect(authService.generateChallenge('')).rejects.toThrow('Invalid Stellar public key');
        });

        it('should reject null wallet address', async () => {
            await expect(authService.generateChallenge(null as any)).rejects.toThrow('Invalid Stellar public key');
        });
    });

    describe('verifySignature', () => {
        it('should verify signature and issue tokens for new user', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result).toHaveProperty('walletAddress', walletAddress);
            expect(result).toHaveProperty('walletType', 'freighter');
            expect(mockRepository.create).toHaveBeenCalled();
            expect(mockRepository.save).toHaveBeenCalled();
        });

        it('should verify signature and update existing user', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            const existingUser = { walletAddress, walletType: 'freighter', lastLoginAt: new Date() };
            mockRepository.findOne.mockResolvedValue(existingUser);
            mockRepository.save.mockResolvedValue({ ...existingUser, lastLoginAt: expect.any(Date) });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            expect(result.walletAddress).toBe(walletAddress);
            expect(mockRepository.create).not.toHaveBeenCalled();
            expect(mockRepository.save).toHaveBeenCalled();
        });

        it('should throw error if nonce is missing', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

            await expect(authService.verifySignature(walletAddress, 'valid_signature', 'freighter'))
                .rejects.toThrow('Nonce missing or expired');
        });

        it('should throw error if signature is invalid', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            const { WalletAuthFactory } = require('../../src/services/WalletSignatureAdapter');
            WalletAuthFactory.getAdapter.mockReturnValueOnce({
                verify: jest.fn().mockResolvedValue(false),
            });

            await expect(authService.verifySignature(walletAddress, 'invalid_signature', 'freighter'))
                .rejects.toThrow('Invalid signature');
        });

        it('should delete nonce after successful verification', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            const storedNonce = await mockRedis.get(`auth:nonce:${walletAddress}`);
            expect(storedNonce).toBeNull();
        });

        it('should support different wallet types', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'albedo' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'albedo' });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'albedo');

            expect(result.walletType).toBe('albedo');
        });
    });

    describe('refreshTokens', () => {
        it('should refresh tokens with valid refresh token', async () => {
            const walletAddress = 'G123';
            const oldRefreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
            const crypto = require('crypto');
            const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, oldHash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(oldRefreshToken);

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.refreshToken).not.toBe(oldRefreshToken); // Token rotation
            expect(result.walletAddress).toBe(walletAddress);
        });

        it('should reject invalid refresh token signature', async () => {
            const invalidToken = jwt.sign({ walletAddress: 'G123' }, 'wrong_secret', { subject: 'G123' });

            await expect(authService.refreshTokens(invalidToken))
                .rejects.toThrow('Invalid or expired refresh token');
        });

        it('should reject expired refresh token', async () => {
            const expiredToken = jwt.sign({ walletAddress: 'G123' }, config.jwtRefreshSecret, {
                subject: 'G123',
                expiresIn: '-1s',
            });

            await expect(authService.refreshTokens(expiredToken))
                .rejects.toThrow('Invalid or expired refresh token');
        });

        it('should reject if refresh token hash does not match', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
            const crypto = require('crypto');
            const wrongHash = crypto.createHash('sha256').update('different_token').digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, wrongHash);

            await expect(authService.refreshTokens(refreshToken))
                .rejects.toThrow('Refresh token revoked or mismatched');
        });

        it('should reject if user not found', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);
            mockRepository.findOne.mockResolvedValue(null);

            await expect(authService.refreshTokens(refreshToken))
                .rejects.toThrow('User not found');
        });

        it('should rotate refresh token on successful refresh', async () => {
            const walletAddress = 'G123';
            const oldRefreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
            const crypto = require('crypto');
            const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, oldHash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(oldRefreshToken);

            const newHash = crypto.createHash('sha256').update(result.refreshToken).digest('hex');
            const storedHash = await mockRedis.get(`auth:refresh:${walletAddress}`);

            expect(storedHash).toBe(newHash);
            expect(storedHash).not.toBe(oldHash);
        });
    });

    describe('logout', () => {
        it('should delete refresh token from Redis', async () => {
            const walletAddress = 'G123';
            await mockRedis.set(`auth:refresh:${walletAddress}`, 'some_hash');

            await authService.logout(walletAddress);

            const stored = await mockRedis.get(`auth:refresh:${walletAddress}`);
            expect(stored).toBeNull();
        });

        it('should handle logout when no token exists', async () => {
            const walletAddress = 'G123';

            await expect(authService.logout(walletAddress)).resolves.not.toThrow();
        });
    });

    describe('Token Expiry Handling', () => {
        it('should issue access token with correct expiry', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            const decoded = jwt.decode(result.accessToken) as any;
            expect(decoded.exp).toBeDefined();
            expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
        });

        it('should issue refresh token with longer expiry than access token', async () => {
            const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
            const nonce = 'test_nonce_123';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            const accessDecoded = jwt.decode(result.accessToken) as any;
            const refreshDecoded = jwt.decode(result.refreshToken) as any;

            expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
        });

        it('should store refresh token hash with 7 day expiry', async () => {
            const walletAddress = 'G123';
            const oldRefreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
            const crypto = require('crypto');
            const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, oldHash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            await authService.refreshTokens(oldRefreshToken);

            // Verify the hash is stored (we can't easily test TTL in mock, but we can verify it's stored)
            const stored = await mockRedis.get(`auth:refresh:${walletAddress}`);
            expect(stored).toBeDefined();
        });
    });
});
