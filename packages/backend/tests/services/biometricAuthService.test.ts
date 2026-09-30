import { AuthService } from '../../src/services/authService';
import { DataSource } from 'typeorm';
import RedisMock from 'ioredis-mock';
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

describe('BiometricAuthService', () => {
    let authService: AuthService;
    let mockDataSource: Partial<DataSource>;
    let mockRepository: any;
    let mockRedis: any;

    const walletAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

    beforeAll(() => {
        mockRepository = {
            findOne: jest.fn(),
            find: jest.fn(),
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

    describe('detectCredentialType', () => {
        it('should use client hint when provided', () => {
            const result = (authService as any).detectCredentialType('test-cred-id', undefined, 'face');
            expect(result).toBe('face');
        });

        it('should use client hint for fingerprint', () => {
            const result = (authService as any).detectCredentialType('test-cred-id', undefined, 'fingerprint');
            expect(result).toBe('fingerprint');
        });

        it('should fall back to heuristic when no hint or authData', () => {
            const credentialId = String.fromCharCode(0) + 'test';
            const result = (authService as any).detectCredentialType(credentialId);
            expect(result).toBe('fingerprint');
        });

        it('should fall back to heuristic (odd char code = face)', () => {
            const credentialId = String.fromCharCode(1) + 'test';
            const result = (authService as any).detectCredentialType(credentialId);
            expect(result).toBe('face');
        });
    });

    describe('resolveAAGUID', () => {
        it('should return null when no attested credential data flag is set', () => {
            const authData = Buffer.alloc(100);
            authData[32] = 0;
            authData.writeUInt32BE(0, 33);
            const result = (authService as any).resolveAAGUID(authData);
            expect(result).toBeNull();
        });

        it('should return fingerprint for Apple Touch ID AAGUID', () => {
            const authData = Buffer.alloc(100);
            authData.set(Buffer.alloc(32), 0);
            authData[32] = 0x41;
            authData.writeUInt32BE(50, 33);

            const aaguid = Buffer.from('08903358000000000000000000000000', 'hex');
            aaguid.copy(authData, 37);

            const result = (authService as any).resolveAAGUID(authData);
            expect(result).toBe('fingerprint');
        });

        it('should return face for Apple Face ID AAGUID', () => {
            const authData = Buffer.alloc(100);
            authData.set(Buffer.alloc(32), 0);
            authData[32] = 0x41;
            authData.writeUInt32BE(50, 33);

            const aaguid = Buffer.from('08903358000000000000000000000001', 'hex');
            aaguid.copy(authData, 37);

            const result = (authService as any).resolveAAGUID(authData);
            expect(result).toBe('face');
        });

        it('should return null for unknown AAGUID', () => {
            const authData = Buffer.alloc(100);
            authData.set(Buffer.alloc(32), 0);
            authData[32] = 0x41;
            authData.writeUInt32BE(50, 33);

            const aaguid = Buffer.from('ffffffffffffffffffffffffffffffff', 'hex');
            aaguid.copy(authData, 37);

            const result = (authService as any).resolveAAGUID(authData);
            expect(result).toBeNull();
        });

        it('should gracefully handle short buffers', () => {
            const authData = Buffer.alloc(10);
            const result = (authService as any).resolveAAGUID(authData);
            expect(result).toBeNull();
        });
    });

    describe('authorizePaymentWithBiometric', () => {
        const mockAssertion = {
            id: 'cred-id-1',
            rawId: 'raw-cred-id-1',
            type: 'public-key' as const,
            response: {
                clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get' })).toString('base64url'),
                authenticatorData: 'test-auth-data',
                signature: 'test-signature',
            },
        };

        beforeEach(() => {
            mockRepository.findOne.mockResolvedValue({
                id: 'cred-1',
                credentialId: 'cred-id-1',
                walletAddress,
                isActive: true,
                publicKey: 'test-public-key',
                counter: 0,
            });
            mockRepository.save.mockResolvedValue({});
        });

        it('should issue payment token on successful biometric verification', async () => {
            await mockRedis.set(`webauthn:auth:${walletAddress}`, 'dGVzdC1jaGFsbGVuZ2U');

            const result = await authService.authorizePaymentWithBiometric(
                walletAddress,
                mockAssertion,
                { amount: '100', destination: 'GDEST123', description: 'Test payment' }
            );

            expect(result).toHaveProperty('paymentToken');
            expect(result).toHaveProperty('expiresIn', 300);
            expect(result.amount).toBe('100');
            expect(result.destination).toBe('GDEST123');
        });

        it('should store payment details in Redis', async () => {
            await mockRedis.set(`webauthn:auth:${walletAddress}`, 'dGVzdC1jaGFsbGVuZ2U');

            const result = await authService.authorizePaymentWithBiometric(
                walletAddress,
                mockAssertion,
                { amount: '50', destination: 'GDEST456' }
            );

            const stored = await mockRedis.get(`payment:auth:${result.paymentToken}`);
            expect(stored).not.toBeNull();

            const parsed = JSON.parse(stored!);
            expect(parsed.walletAddress).toBe(walletAddress);
            expect(parsed.amount).toBe('50');
            expect(parsed.destination).toBe('GDEST456');
        });

        it('should throw if biometric assertion fails', async () => {
            mockRepository.findOne.mockResolvedValue(null);

            await mockRedis.set(`webauthn:auth:${walletAddress}`, 'dGVzdC1jaGFsbGVuZ2U');

            await expect(
                authService.authorizePaymentWithBiometric(
                    walletAddress,
                    mockAssertion,
                    { amount: '100', destination: 'GDEST123' }
                )
            ).rejects.toThrow();
        });
    });

    describe('redeemPaymentToken', () => {
        it('should return payment details for valid token', async () => {
            const token = 'test-payment-token';
            await mockRedis.set(
                `payment:auth:${token}`,
                JSON.stringify({
                    walletAddress,
                    amount: '200',
                    destination: 'GDEST789',
                    description: 'Test',
                })
            );

            const result = await authService.redeemPaymentToken(token, walletAddress);
            expect(result).toEqual({ amount: '200', destination: 'GDEST789' });
        });

        it('should return null for invalid token', async () => {
            const result = await authService.redeemPaymentToken('invalid-token', walletAddress);
            expect(result).toBeNull();
        });

        it('should return null if wallet address does not match', async () => {
            const token = 'test-payment-token';
            await mockRedis.set(
                `payment:auth:${token}`,
                JSON.stringify({
                    walletAddress: 'GDIFFERENTWALLET123',
                    amount: '200',
                    destination: 'GDEST789',
                })
            );

            const result = await authService.redeemPaymentToken(token, walletAddress);
            expect(result).toBeNull();
        });

        it('should delete token after redemption (one-time use)', async () => {
            const token = 'one-time-token';
            await mockRedis.set(
                `payment:auth:${token}`,
                JSON.stringify({ walletAddress, amount: '100', destination: 'GDEST' })
            );

            await authService.redeemPaymentToken(token, walletAddress);

            const stored = await mockRedis.get(`payment:auth:${token}`);
            expect(stored).toBeNull();
        });
    });

    describe('generateBiometricFallbackChallenge', () => {
        it('should generate a fallback challenge for enrolled user', async () => {
            mockRepository.find.mockResolvedValue([
                { id: 'cred-1', walletAddress, isActive: true },
            ]);

            const result = await authService.generateBiometricFallbackChallenge(walletAddress);

            expect(result).toHaveProperty('challenge');
            expect(result).toHaveProperty('expiresIn');
            expect(result).toHaveProperty('message');
            expect(result.walletAddress).toBe(walletAddress);
            expect(result.message).toContain(result.challenge);
        });

        it('should reject if user has no enrolled credentials', async () => {
            mockRepository.find.mockResolvedValue([]);

            await expect(
                authService.generateBiometricFallbackChallenge(walletAddress)
            ).rejects.toThrow('No biometric credentials enrolled');
        });

        it('should store challenge in Redis', async () => {
            mockRepository.find.mockResolvedValue([
                { id: 'cred-1', walletAddress, isActive: true },
            ]);

            const result = await authService.generateBiometricFallbackChallenge(walletAddress);

            const stored = await mockRedis.get(`auth:biometric:fallback:${walletAddress}`);
            expect(stored).toBe(result.challenge);
        });

        it('should reject invalid wallet address', async () => {
            await expect(
                authService.generateBiometricFallbackChallenge('invalid')
            ).rejects.toThrow('Invalid Stellar public key');
        });
    });

    describe('verifyBiometricFallback', () => {
        it('should issue tokens on successful fallback verification', async () => {
            const nonce = 'test-fallback-nonce';
            await mockRedis.set(`auth:biometric:fallback:${walletAddress}`, nonce, 'EX', 300);

            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            const result = await authService.verifyBiometricFallback(walletAddress, 'valid-sig', 'freighter');

            expect(result).toHaveProperty('accessToken');
            expect(result).toHaveProperty('refreshToken');
            expect(result.walletAddress).toBe(walletAddress);
        });

        it('should throw if no fallback challenge exists', async () => {
            await expect(
                authService.verifyBiometricFallback(walletAddress, 'some-sig', 'freighter')
            ).rejects.toThrow('Fallback challenge missing or expired');
        });

        it('should delete challenge after successful verification', async () => {
            const nonce = 'test-fallback-nonce';
            await mockRedis.set(`auth:biometric:fallback:${walletAddress}`, nonce, 'EX', 300);

            mockRepository.findOne.mockResolvedValue({ walletAddress, walletType: 'freighter' });

            await authService.verifyBiometricFallback(walletAddress, 'valid-sig', 'freighter');

            const stored = await mockRedis.get(`auth:biometric:fallback:${walletAddress}`);
            expect(stored).toBeNull();
        });
    });

    describe('registerBiometricCredential with credentialType hint', () => {
        const mockCredential = {
            id: 'new-cred-id',
            rawId: 'new-raw-cred-id',
            type: 'public-key' as const,
            response: {
                clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.create' })).toString('base64url'),
                attestationObject: Buffer.from(
                    JSON.stringify({ fmt: 'none', attStmt: {} }),
                    'utf8'
                ).toString('base64url'),
                transports: ['internal'] as any,
            },
        };

        beforeEach(async () => {
            await mockRedis.set(`webauthn:reg:${walletAddress}`, 'dGVzdC1jaGFsbGVuZ2U');
            mockRepository.findOne.mockResolvedValue(null);
            mockRepository.create.mockReturnValue({});
            mockRepository.save.mockResolvedValue({});
        });

        it('should accept credentialType hint from client', async () => {
            const result = await authService.registerBiometricCredential(
                walletAddress,
                mockCredential,
                'iPhone 15 Pro',
                'face'
            );

            const savedCall = mockRepository.save.mock.calls[0][0];
            expect(savedCall.credentialType).toBe('face');
            expect(savedCall.deviceName).toBe('iPhone 15 Pro');
        });

        it('should use fingerprint hint when provided', async () => {
            const result = await authService.registerBiometricCredential(
                walletAddress,
                mockCredential,
                'Pixel 8',
                'fingerprint'
            );

            const savedCall = mockRepository.save.mock.calls[0][0];
            expect(savedCall.credentialType).toBe('fingerprint');
        });

        it('should use heuristic when no hint provided', async () => {
            const result = await authService.registerBiometricCredential(
                walletAddress,
                mockCredential,
                'Generic Device'
            );

            const savedCall = mockRepository.save.mock.calls[0][0];
            expect(savedCall.credentialType).toBeDefined();
            expect(savedCall.deviceName).toBe('Generic Device');
        });

        it('should throw if credential already registered', async () => {
            mockRepository.findOne.mockResolvedValue({ id: 'existing', credentialId: 'new-cred-id' });

            await expect(
                authService.registerBiometricCredential(walletAddress, mockCredential)
            ).rejects.toThrow('Credential already registered');
        });

        it('should throw if challenge expired', async () => {
            await expect(
                authService.registerBiometricCredential('GOTHER1234567890123456789012345678901234567890123456', mockCredential)
            ).rejects.toThrow('Registration challenge not found or expired');
        });
    });

    describe('getBiometricCredentials', () => {
        it('should return formatted credentials list', async () => {
            const now = new Date();
            mockRepository.find.mockResolvedValue([
                {
                    id: 'cred-1',
                    credentialId: 'cred-id-1',
                    credentialType: 'fingerprint',
                    deviceName: 'iPhone 15',
                    createdAt: now,
                    lastUsedAt: now,
                    walletAddress,
                    isActive: true,
                },
                {
                    id: 'cred-2',
                    credentialId: 'cred-id-2',
                    credentialType: 'face',
                    deviceName: null,
                    createdAt: now,
                    lastUsedAt: null,
                    walletAddress,
                    isActive: true,
                },
            ]);

            const result = await authService.getBiometricCredentials(walletAddress);

            expect(result).toHaveLength(2);
            expect(result[0]).toHaveProperty('credentialId', 'cred-id-1');
            expect(result[0].type).toBe('fingerprint');
            expect(result[0].deviceName).toBe('iPhone 15');
            expect(result[1].type).toBe('face');
            expect(result[1].deviceName).toBeNull();
        });

        it('should return empty array if no credentials', async () => {
            mockRepository.find.mockResolvedValue([]);

            const result = await authService.getBiometricCredentials(walletAddress);
            expect(result).toEqual([]);
        });
    });
});
