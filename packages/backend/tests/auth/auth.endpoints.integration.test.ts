import request from 'supertest';
import express from 'express';
import { authRoutes } from '../../src/api/routes/auth';
import { AppDataSource } from '../../src/db/dataSource';
import { AuthService } from '../../src/services/authService';
import { config } from '../../src/config';
import jwt from 'jsonwebtoken';

jest.mock('../../src/services/authService');

describe('Auth Endpoints - Integration Tests', () => {
    let app: express.Application;

    beforeAll(() => {
        app = express();
        app.use(express.json());
        app.use('/auth', authRoutes);
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /auth/challenge', () => {
        it('should generate a challenge for a valid wallet address', async () => {
            const mockChallenge = {
                nonce: 'abc123def456',
                expiresIn: 300,
                message: 'Sign this message to authenticate with Traqora: abc123def456',
            };

            (AuthService.prototype.generateChallenge as jest.Mock).mockResolvedValue(mockChallenge);

            const response = await request(app)
                .post('/auth/challenge')
                .send({ walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockChallenge);
            expect(AuthService.prototype.generateChallenge).toHaveBeenCalledWith(
                'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB'
            );
        });

        it('should return 400 for invalid wallet address', async () => {
            (AuthService.prototype.generateChallenge as jest.Mock).mockRejectedValue(
                new Error('Invalid Stellar public key')
            );

            const response = await request(app)
                .post('/auth/challenge')
                .send({ walletAddress: 'INVALID' });

            expect(response.status).toBe(400);
        });

        it('should return 400 if walletAddress is missing', async () => {
            const response = await request(app)
                .post('/auth/challenge')
                .send({});

            expect(response.status).toBe(400);
        });
    });

    describe('POST /auth/verify', () => {
        it('should verify signature and return tokens', async () => {
            const mockTokens = {
                accessToken: 'access_token_123',
                refreshToken: 'refresh_token_456',
                expiresIn: 3600,
                walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
                walletType: 'freighter',
            };

            (AuthService.prototype.verifySignature as jest.Mock).mockResolvedValue(mockTokens);

            const response = await request(app)
                .post('/auth/verify')
                .send({
                    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
                    signature: 'valid_signature',
                    walletType: 'freighter',
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockTokens);
            expect(AuthService.prototype.verifySignature).toHaveBeenCalledWith(
                'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
                'valid_signature',
                'freighter'
            );
        });

        it('should return 401 for invalid signature', async () => {
            (AuthService.prototype.verifySignature as jest.Mock).mockRejectedValue(
                new Error('Invalid signature')
            );

            const response = await request(app)
                .post('/auth/verify')
                .send({
                    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
                    signature: 'invalid_signature',
                    walletType: 'freighter',
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 401 for expired nonce', async () => {
            (AuthService.prototype.verifySignature as jest.Mock).mockRejectedValue(
                new Error('Nonce missing or expired')
            );

            const response = await request(app)
                .post('/auth/verify')
                .send({
                    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB',
                    signature: 'some_signature',
                    walletType: 'freighter',
                });

            expect(response.status).toBe(401);
        });

        it('should return 400 if required fields are missing', async () => {
            const response = await request(app)
                .post('/auth/verify')
                .send({ walletAddress: 'G123' });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /auth/refresh', () => {
        it('should refresh tokens with valid refresh token', async () => {
            const mockNewTokens = {
                accessToken: 'new_access_token',
                refreshToken: 'new_refresh_token',
                expiresIn: 3600,
                walletAddress: 'G123',
                walletType: 'freighter',
            };

            (AuthService.prototype.refreshTokens as jest.Mock).mockResolvedValue(mockNewTokens);

            const response = await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: 'valid_refresh_token' });

            expect(response.status).toBe(200);
            expect(response.body).toEqual(mockNewTokens);
            expect(AuthService.prototype.refreshTokens).toHaveBeenCalledWith('valid_refresh_token');
        });

        it('should return 401 for invalid refresh token', async () => {
            (AuthService.prototype.refreshTokens as jest.Mock).mockRejectedValue(
                new Error('Invalid or expired refresh token')
            );

            const response = await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: 'invalid_token' });

            expect(response.status).toBe(401);
        });

        it('should return 401 for revoked refresh token', async () => {
            (AuthService.prototype.refreshTokens as jest.Mock).mockRejectedValue(
                new Error('Refresh token revoked or mismatched')
            );

            const response = await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: 'revoked_token' });

            expect(response.status).toBe(401);
        });

        it('should return 400 if refreshToken is missing', async () => {
            const response = await request(app)
                .post('/auth/refresh')
                .send({});

            expect(response.status).toBe(400);
        });
    });

    describe('POST /auth/logout', () => {
        it('should logout successfully with valid token', async () => {
            const validToken = jwt.sign(
                { walletAddress: 'G123', walletType: 'freighter' },
                config.jwtSecret
            );

            (AuthService.prototype.logout as jest.Mock).mockResolvedValue(undefined);

            const response = await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${validToken}`)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ message: 'Logged out successfully' });
            expect(AuthService.prototype.logout).toHaveBeenCalledWith('G123');
        });

        it('should return 401 if token is missing', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .send({});

            expect(response.status).toBe(401);
        });

        it('should return 401 if token is expired', async () => {
            const expiredToken = jwt.sign(
                { walletAddress: 'G123', walletType: 'freighter' },
                config.jwtSecret,
                { expiresIn: '-1s' }
            );

            const response = await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${expiredToken}`)
                .send({});

            expect(response.status).toBe(401);
        });

        it('should return 401 if token is invalid', async () => {
            const response = await request(app)
                .post('/auth/logout')
                .set('Authorization', 'Bearer invalid_token')
                .send({});

            expect(response.status).toBe(401);
        });
    });

    describe('Wallet Type Support', () => {
        const walletTypes = ['freighter', 'albedo', 'rabet'];

        walletTypes.forEach((walletType) => {
            it(`should support ${walletType} wallet type in verify endpoint`, async () => {
                const mockTokens = {
                    accessToken: 'access_token',
                    refreshToken: 'refresh_token',
                    expiresIn: 3600,
                    walletAddress: 'G123',
                    walletType,
                };

                (AuthService.prototype.verifySignature as jest.Mock).mockResolvedValue(mockTokens);

                const response = await request(app)
                    .post('/auth/verify')
                    .send({
                        walletAddress: 'G123',
                        signature: 'valid_signature',
                        walletType,
                    });

                expect(response.status).toBe(200);
                expect(response.body.walletType).toBe(walletType);
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle unexpected errors gracefully', async () => {
            (AuthService.prototype.generateChallenge as jest.Mock).mockRejectedValue(
                new Error('Unexpected error')
            );

            const response = await request(app)
                .post('/auth/challenge')
                .send({ walletAddress: 'G123' });

            expect(response.status).toBe(500);
        });

        it('should handle database errors', async () => {
            (AuthService.prototype.verifySignature as jest.Mock).mockRejectedValue(
                new Error('Database connection failed')
            );

            const response = await request(app)
                .post('/auth/verify')
                .send({
                    walletAddress: 'G123',
                    signature: 'sig',
                    walletType: 'freighter',
                });

            expect(response.status).toBe(500);
        });
    });
});
