import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
import RedisMock from 'ioredis-mock';
import { WalletAuthFactory } from '../../src/services/WalletSignatureAdapter';

jest.mock('ioredis', () => require('ioredis-mock'));

const mockVerify = jest.fn();

jest.mock('../../src/services/WalletSignatureAdapter', () => {
    return {
        WalletAuthFactory: {
            getAdapter: jest.fn().mockReturnValue({
                verify: (...args: any[]) => mockVerify(...args)
            })
        }
    };
});

describe('AuthService - Verify', () => {
    let authService: AuthService;
    let mockDataSource: Partial<DataSource>;
    let mockRepository: any;

    beforeAll(() => {
        mockRepository = {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockImplementation((u) => u),
            save: jest.fn().mockResolvedValue(true)
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

    it('should verify valid signature, issue tokens, and clear nonce', async () => {
        const validWallet = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
        const nonce = 'random_nonce';

        await (authService as any).redis.set(`auth:nonce:${validWallet}`, nonce);
        mockVerify.mockResolvedValueOnce(true);

        const result = await authService.verifySignature(validWallet, 'valid_signature', 'freighter');

        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
        expect(result.walletAddress).toBe(validWallet);
        expect(result.walletType).toBe('freighter');

        // Should clear nonce to make it one-time
        const nonceLeft = await (authService as any).redis.get(`auth:nonce:${validWallet}`);
        expect(nonceLeft).toBeNull();

        expect(mockRepository.create).toHaveBeenCalled();
        expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw if nonce was missing or expired', async () => {
        const validWallet = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

        // Notice we do NOT set the nonce
        await expect(authService.verifySignature(validWallet, 'some_sig', 'freighter')).rejects.toThrow('Nonce missing or expired');
    });

    it('should throw if signature validation fails and NOT clear nonce', async () => {
        const validWallet = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';
        const nonce = 'random_nonce';

        await (authService as any).redis.set(`auth:nonce:${validWallet}`, nonce);
        mockVerify.mockResolvedValueOnce(false);

        await expect(authService.verifySignature(validWallet, 'wrong_sig', 'freighter')).rejects.toThrow('Invalid signature');

        // Nonce should remain, wait we did not delete on failure
        const nonceLeft = await (authService as any).redis.get(`auth:nonce:${validWallet}`);
        expect(nonceLeft).toBe(nonce);
    });
});
