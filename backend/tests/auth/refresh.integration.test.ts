import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
import RedisMock from 'ioredis-mock';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';

jest.mock('ioredis', () => require('ioredis-mock'));

// Mocking the strategy adapters for predictable unit testing
jest.mock('../../src/services/WalletSignatureAdapter', () => {
    return {
        WalletAuthFactory: {
            getAdapter: jest.fn().mockReturnValue({
                verify: jest.fn().mockImplementation(async (sig) => {
                    return sig === 'valid_signature';
                })
            })
        }
    };
});

describe('AuthService - Refresh', () => {
    let authService: AuthService;
    let mockDataSource: Partial<DataSource>;
    let mockRepository: any;

    beforeAll(() => {
        mockRepository = {
            findOne: jest.fn().mockResolvedValue({ walletAddress: 'G123', walletType: 'freighter' }),
        };

        mockDataSource = {
            getRepository: jest.fn().mockReturnValue(mockRepository),
        };

        authService = new AuthService(mockDataSource as DataSource);
        (authService as any).redis = new RedisMock();
    });

    afterAll(async () => {
        await authService.disconnect();
    });

    afterEach(async () => {
        await (authService as any).redis.flushall();
        jest.clearAllMocks();
    });

    it('should refresh tokens successfully if refresh token matches hash', async () => {
        const validWallet = 'G123';

        // Create a mock token to represent the old refresh token
        const oldRefreshToken = jwt.sign({ walletAddress: validWallet }, config.jwtRefreshSecret, { subject: validWallet });
        const crypto = require('crypto');
        const oldHash = crypto.createHash('sha256').update(oldRefreshToken).digest('hex');

        await (authService as any).redis.set(`auth:refresh:${validWallet}`, oldHash);

        const result = await authService.refreshTokens(oldRefreshToken);

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.refreshToken).not.toBe(oldRefreshToken); // Rotated
        expect(result.walletAddress).toBe(validWallet);
    });

    it('should reject if refresh token is revoked / missing hash', async () => {
        const oldRefreshToken = jwt.sign({ walletAddress: 'G123' }, config.jwtRefreshSecret, { subject: 'G123' });

        await expect(authService.refreshTokens(oldRefreshToken)).rejects.toThrow('Refresh token revoked or mismatched');
    });

    it('should reject if refresh token signature is invalid', async () => {
        const invalidToken = jwt.sign({ walletAddress: 'G123' }, 'wrong_secret', { subject: 'G123' });
        await expect(authService.refreshTokens(invalidToken)).rejects.toThrow('Invalid or expired refresh token');
    });
});
