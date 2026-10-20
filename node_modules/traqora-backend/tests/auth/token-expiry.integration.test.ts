import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
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

describe('Token Expiry Scenarios - Integration Tests', () => {
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

    describe('Access Token Expiry', () => {
        it('should issue access token with standard expiry time', async () => {
            const walletAddress = 'G123';
            const nonce = 'test_nonce';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            const decoded = jwt.decode(result.accessToken) as any;
            const currentTime = Math.floor(Date.now() / 1000);
            const expectedExpiry = currentTime + 3600; // 1 hour default

            expect(decoded.exp).toBeGreaterThan(currentTime);
            expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 10); // Allow 10s tolerance
        });

        it('should reject access token used after expiry', async () => {
            const expiredToken = jwt.sign(
                { walletAddress: 'G123', walletType: 'freighter' },
                config.jwtSecret,
                { expiresIn: '-1s' }
            );

            try {
                jwt.verify(expiredToken, config.jwtSecret);
                fail('Should have thrown TokenExpiredError');
            } catch (error: any) {
                expect(error.name).toBe('TokenExpiredError');
            }
        });

        it('should reject access token expired by 1 hour', async () => {
            const expiredToken = jwt.sign(
                { walletAddress: 'G123', walletType: 'freighter' },
                config.jwtSecret,
                { expiresIn: '-1h' }
            );

            try {
                jwt.verify(expiredToken, config.jwtSecret);
                fail('Should have thrown TokenExpiredError');
            } catch (error: any) {
                expect(error.name).toBe('TokenExpiredError');
            }
        });

        it('should accept access token with 1 second remaining', async () => {
            const nearExpiryToken = jwt.sign(
                { walletAddress: 'G123', walletType: 'freighter' },
                config.jwtSecret,
                { expiresIn: '1s' }
            );

            const decoded = jwt.verify(nearExpiryToken, config.jwtSecret) as any;
            expect(decoded.walletAddress).toBe('G123');
        });

        it('should accept access token with long expiry', async () => {
            const longExpiryToken = jwt.sign(
                { walletAddress: 'G123', walletType: 'freighter' },
                config.jwtSecret,
                { expiresIn: '30d' }
            );

            const decoded = jwt.verify(longExpiryToken, config.jwtSecret) as any;
            expect(decoded.walletAddress).toBe('G123');
        });
    });

    describe('Refresh Token Expiry', () => {
        it('should issue refresh token with longer expiry than access token', async () => {
            const walletAddress = 'G123';
            const nonce = 'test_nonce';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            const accessDecoded = jwt.decode(result.accessToken) as any;
            const refreshDecoded = jwt.decode(result.refreshToken) as any;

            expect(refreshDecoded.exp).toBeGreaterThan(accessDecoded.exp);
        });

        it('should reject refresh token after expiry', async () => {
            const expiredRefreshToken = jwt.sign(
                { walletAddress: 'G123' },
                config.jwtRefreshSecret,
                { expiresIn: '-1s', subject: 'G123' }
            );

            await expect(authService.refreshTokens(expiredRefreshToken))
                .rejects.toThrow('Invalid or expired refresh token');
        });

        it('should reject refresh token expired by 7 days', async () => {
            const expiredRefreshToken = jwt.sign(
                { walletAddress: 'G123' },
                config.jwtRefreshSecret,
                { expiresIn: '-7d', subject: 'G123' }
            );

            await expect(authService.refreshTokens(expiredRefreshToken))
                .rejects.toThrow('Invalid or expired refresh token');
        });

        it('should accept refresh token with 1 day remaining', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '1d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(refreshToken);

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
        });

        it('should rotate refresh token on successful refresh', async () => {
            const walletAddress = 'G123';
            const oldRefreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '7d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, oldHash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(oldRefreshToken);

            const newHash = crypto.createHash('sha256').update(result.refreshToken).digest('hex');
            const storedHash = await mockRedis.get(`auth:refresh:${walletAddress}`);

            expect(storedHash).toBe(newHash);
            expect(storedHash).not.toBe(oldHash);
            expect(result.refreshToken).not.toBe(oldRefreshToken);
        });
    });

    describe('Nonce Expiry', () => {
        it('should reject signature verification with expired nonce', async () => {
            const walletAddress = 'G123';
            // Don't set nonce - simulating expired/missing nonce

            await expect(authService.verifySignature(walletAddress, 'valid_signature', 'freighter'))
                .rejects.toThrow('Nonce missing or expired');
        });

        it('should generate nonce with configurable expiry', async () => {
            const walletAddress = 'G123';
            const result = await authService.generateChallenge(walletAddress);

            expect(result.expiresIn).toBeDefined();
            expect(result.expiresIn).toBeGreaterThan(0);
        });

        it('should clear nonce after successful verification', async () => {
            const walletAddress = 'G123';
            const nonce = 'test_nonce';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({ walletAddress, walletType: 'freighter' });
            mockRepository.save.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            await authService.verifySignature(walletAddress, 'valid_signature', 'freighter');

            const storedNonce = await mockRedis.get(`auth:nonce:${walletAddress}`);
            expect(storedNonce).toBeNull();
        });

        it('should keep nonce after failed signature verification', async () => {
            const walletAddress = 'G123';
            const nonce = 'test_nonce';
            await mockRedis.set(`auth:nonce:${walletAddress}`, nonce);

            const { WalletAuthFactory } = require('../../src/services/WalletSignatureAdapter');
            WalletAuthFactory.getAdapter.mockReturnValueOnce({
                verify: jest.fn().mockResolvedValue(false),
            });

            await expect(authService.verifySignature(walletAddress, 'invalid_signature', 'freighter'))
                .rejects.toThrow('Invalid signature');

            const storedNonce = await mockRedis.get(`auth:nonce:${walletAddress}`);
            expect(storedNonce).toBe(nonce);
        });
    });

    describe('Token Refresh Flow with Expiry', () => {
        it('should handle refresh token near expiry', async () => {
            const walletAddress = 'G123';
            const nearExpiryRefreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '1s', subject: walletAddress }
            );
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(nearExpiryRefreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(nearExpiryRefreshToken);

            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.refreshToken).not.toBe(nearExpiryRefreshToken);
        });

        it('should issue new access token with fresh expiry on refresh', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '7d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(refreshToken);

            const decoded = jwt.decode(result.accessToken) as any;
            const currentTime = Math.floor(Date.now() / 1000);
            const expectedExpiry = currentTime + 3600; // 1 hour

            expect(decoded.exp).toBeGreaterThan(currentTime);
            expect(decoded.exp).toBeLessThanOrEqual(expectedExpiry + 10);
        });

        it('should issue new refresh token with fresh expiry on refresh', async () => {
            const walletAddress = 'G123';
            const oldRefreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '7d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, oldHash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.refreshTokens(oldRefreshToken);

            const oldDecoded = jwt.decode(oldRefreshToken) as any;
            const newDecoded = jwt.decode(result.refreshToken) as any;

            expect(newDecoded.exp).toBeGreaterThan(oldDecoded.exp);
        });
    });

    describe('Logout and Token Invalidation', () => {
        it('should invalidate refresh token on logout', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '7d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);

            await authService.logout(walletAddress);

            const storedHash = await mockRedis.get(`auth:refresh:${walletAddress}`);
            expect(storedHash).toBeNull();
        });

        it('should prevent refresh after logout', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '7d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            // Logout
            await authService.logout(walletAddress);

            // Try to refresh
            await expect(authService.refreshTokens(refreshToken))
                .rejects.toThrow('Refresh token revoked or mismatched');
        });

        it('should handle logout when no refresh token exists', async () => {
            const walletAddress = 'G123';

            await expect(authService.logout(walletAddress)).resolves.not.toThrow();
        });
    });

    describe('Concurrent Token Usage', () => {
        it('should handle multiple refresh attempts correctly', async () => {
            const walletAddress = 'G123';
            const refreshToken = jwt.sign(
                { walletAddress },
                config.jwtRefreshSecret,
                { expiresIn: '7d', subject: walletAddress }
            );
            const crypto = require('crypto');
            const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');

            await mockRedis.set(`auth:refresh:${walletAddress}`, hash);
            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            // First refresh
            const result1 = await authService.refreshTokens(refreshToken);

            // Second refresh with old token should fail
            await expect(authService.refreshTokens(refreshToken))
                .rejects.toThrow('Refresh token revoked or mismatched');

            // Third refresh with new token should succeed
            const crypto2 = require('crypto');
            const newHash = crypto2.createHash('sha256').update(result1.refreshToken).digest('hex');
            await mockRedis.set(`auth:refresh:${walletAddress}`, newHash);

            const result2 = await authService.refreshTokens(result1.refreshToken);
            expect(result2.accessToken).toBeDefined();
        });
    });
});
