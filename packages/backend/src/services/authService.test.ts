import { AuthService } from './authService';
import jwt from 'jsonwebtoken';
import { config } from '../config';

describe('AuthService JWT Rotation Without Logout', () => {
    let authService: any;
    let mockRedis: any;
    let mockUserRepository: any;

    beforeEach(() => {
        mockRedis = {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn(),
            del: jest.fn().mockResolvedValue(1),
            quit: jest.fn().mockResolvedValue('OK'),
        };
        mockUserRepository = {
            findOne: jest.fn().mockResolvedValue({ walletAddress: 'GB----------------------------------------------------', walletType: 'freighter' }),
        };

        authService = new AuthService({} as any);
        authService['redis'] = mockRedis;
        authService['userRepository'] = mockUserRepository;
    });

    test('happy path: refreshes valid tokens and rotates refresh token', async () => {
        const walletAddress = 'GB----------------------------------------------------';
        const oldRefreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
        const oldHash = require('crypto').createHash('sha256').update(oldRefreshToken).digest('hex');

        mockRedis.get.mockResolvedValueOnce(oldHash);

        const result = await authService.refreshTokens(oldRefreshToken);

        expect(result).toHaveProperty('accessToken');
        expect(result).toHaveProperty('refreshToken');
        expect(result.refreshToken).not.toEqual(oldRefreshToken);
        expect(mockRedis.set).toHaveBeenCalledTimes(1);
    });

    test('key failure mode: detects token reuse / replay and revokes session', async () => {
        const walletAddress = 'GB----------------------------------------------------';
        const staleRefreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, { subject: walletAddress });
        
        // Stored hash in Redis is different (already rotated)
        mockRedis.get.mockResolvedValueOnce('some_other_new_hash');

        await expect(authService.refreshTokens(staleRefreshToken)).rejects.toThrow(
            'Refresh token reuse detected. Session revoked.'
        );

        expect(mockRedis.del).toHaveBeenCalledWith(`auth:refresh:${walletAddress}`);
    });
});
