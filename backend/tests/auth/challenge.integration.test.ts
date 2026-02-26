import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
import RedisMock from 'ioredis-mock';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('AuthService - Challenge', () => {
    let authService: AuthService;
    let mockDataSource: Partial<DataSource>;

    beforeAll(() => {
        mockDataSource = {
            getRepository: jest.fn().mockReturnValue({}),
        };
        authService = new AuthService(mockDataSource as DataSource);
        // Use the internal mock redis attached to authService
        (authService as any).redis = new RedisMock();
    });

    afterAll(async () => {
        await authService.disconnect();
    });

    afterEach(async () => {
        await (authService as any).redis.flushall();
    });

    it('should generate a challenge and store the nonce', async () => {
        const validWallet = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB'; // Length 56
        const result = await authService.generateChallenge(validWallet);

        expect(result.nonce).toBeDefined();
        expect(result.nonce.length).toBe(64); // 32 bytes hex
        expect(result.expiresIn).toBe(300); // from our mock config or default
        expect(result.message).toContain(result.nonce);

        // Verify it was stored in Redis
        const storedNonce = await (authService as any).redis.get(`auth:nonce:${validWallet}`);
        expect(storedNonce).toBe(result.nonce);
    });

    it('should reject invalid wallet addresses', async () => {
        const invalidWallet = 'INVALID_WALLET';

        await expect(authService.generateChallenge(invalidWallet)).rejects.toThrow('Invalid Stellar public key');
        await expect(authService.generateChallenge('')).rejects.toThrow('Invalid Stellar public key');
    });
});
