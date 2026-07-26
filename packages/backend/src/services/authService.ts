import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { User } from '../db/entities/User';
import { BiometricCredential } from '../db/entities/BiometricCredential';
import { WalletAuthFactory } from './WalletSignatureAdapter';
import { config } from '../config';

interface ChallengeResponse {
    nonce: string;
    expiresIn: number;
    message: string;
}

interface VerifyResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    walletAddress: string;
    walletType: string;
}

export interface BiometricCredentialInfo {
    id: string;
    credentialId: string;
    type: 'fingerprint' | 'face';
    deviceName: string | null;
    enrolledAt: Date;
    lastUsedAt: Date | null;
}

export interface WebAuthnRegistrationOptions {
    challenge: string;
    rp: { name: string; id: string };
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
    timeout: number;
    attestation: 'none' | 'direct' | 'indirect';
    authenticatorSelection: {
        authenticatorAttachment: 'platform' | 'cross-platform';
        residentKey: 'preferred' | 'required' | 'discouraged';
        userVerification: 'required' | 'preferred' | 'discouraged';
    };
}

export interface WebAuthnAuthenticationOptions {
    challenge: string;
    timeout: number;
    rpId: string;
    allowCredentials: Array<{
        type: 'public-key';
        id: string;
        transports?: AuthenticatorTransport[];
    }>;
    userVerification: 'required' | 'preferred' | 'discouraged';
}

type AuthenticatorTransport = 'usb' | 'nfc' | 'ble' | 'internal' | 'hybrid';

// Convert Buffer or ArrayBuffer to base64url string
function arrayBufferToBase64url(buf: Buffer | ArrayBuffer): string {
    return Buffer.from(buf as any)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

// Convert base64url string to Buffer
function base64urlToBuffer(str: string): Buffer {
    return Buffer.from(
        str.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
    );
}

export class AuthService {
    private redis: Redis;
    private userRepository: Repository<User>;
    private biometricRepository: Repository<BiometricCredential>;

    constructor(dataSource: DataSource, redisUrl: string = config.redisUrl) {
        // If we're strictly testing without Redis, we might want a mock, but for prod use this
        this.redis = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
        });
        this.userRepository = dataSource.getRepository(User);
        this.biometricRepository = dataSource.getRepository(BiometricCredential);
    }

    /*
     * Start the auth challenge by generating a nonce for the wallet address.
     */
    async generateChallenge(walletAddress: string): Promise<ChallengeResponse> {
        // Minimal validation to assure it stringifies correctly (full stellar validation can be done via stellar-sdk Keypair)
        if (!walletAddress || !walletAddress.startsWith('G') || walletAddress.length !== 56) {
            throw new Error('Invalid Stellar public key');
        }

        const nonce = crypto.randomBytes(32).toString('hex');
        const expiresIn = config.nonceExpirySeconds;

        await this.redis.set(`auth:nonce:${walletAddress}`, nonce, 'EX', expiresIn);

        return {
            nonce,
            expiresIn,
            message: `Sign this message to authenticate with Traqora: ${nonce}`,
        };
    }

    /*
     * Verify the signed message from the client wallet.
     */
    async verifySignature(
        walletAddress: string,
        signature: string,
        walletType: 'freighter' | 'albedo' | 'rabet'
    ): Promise<VerifyResponse> {
        const nonce = await this.redis.get(`auth:nonce:${walletAddress}`);
        if (!nonce) {
            throw new Error('Nonce missing or expired');
        }

        const message = `Sign this message to authenticate with Traqora: ${nonce}`;
        const adapter = WalletAuthFactory.getAdapter(walletType);

        // Some adapters need networkPassphrase for strict XDR checking
        let networkPassphrase = '';
        if (config.stellarNetwork === 'testnet') {
            networkPassphrase = 'Test SDF Network ; September 2015';
        } else if (config.stellarNetwork === 'mainnet') {
            networkPassphrase = 'Public Global Stellar Network ; September 2015';
        }

        const isValid = await adapter.verify(signature, walletAddress, message, networkPassphrase);

        if (!isValid) {
            throw new Error('Invalid signature');
        }

        // Immediate cleanup for one-time use logic
        await this.redis.del(`auth:nonce:${walletAddress}`);

        // Upsert User
        let user = await this.userRepository.findOne({ where: { walletAddress } });
        if (!user) {
            user = this.userRepository.create({
                walletAddress,
                walletType,
                createdAt: new Date(),
                lastLoginAt: new Date(),
            });
        } else {
            user.lastLoginAt = new Date();
        }
        await this.userRepository.save(user);

        return this.issueTokens(walletAddress, walletType);
    }

    /*
     * Issue new JWT token pair and store the refresh token hash.
     */
    async issueTokens(walletAddress: string, walletType: string): Promise<VerifyResponse> {
        const accessToken = jwt.sign({ walletAddress, walletType }, config.jwtSecret, {
            expiresIn: config.jwtExpiresIn as any,
            subject: walletAddress,
        });

        const refreshToken = jwt.sign({ walletAddress }, config.jwtRefreshSecret, {
            expiresIn: config.jwtRefreshExpiresIn as any,
            subject: walletAddress,
        });

        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        // Store for 7 days (7 * 24 * 60 * 60 = 604800s)
        await this.redis.set(`auth:refresh:${walletAddress}`, refreshHash, 'EX', 604800);

        return {
            accessToken,
            refreshToken,
            expiresIn: 3600, // standard access token duration info for client
            walletAddress,
            walletType,
        };
    }

    /*
     * Refresh the token pair using a valid refresh token.
     */
    async refreshTokens(refreshToken: string): Promise<VerifyResponse> {
        let payload: any;
        try {
            payload = jwt.verify(refreshToken, config.jwtRefreshSecret);
        } catch (e) {
            throw new Error('Invalid or expired refresh token');
        }

        const walletAddress = payload.sub as string;
        if (!walletAddress) {
            throw new Error('Invalid token payload');
        }

        const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
        const storedHash = await this.redis.get(`auth:refresh:${walletAddress}`);

        if (storedHash !== refreshHash) {
            throw new Error('Refresh token revoked or mismatched');
        }

        // We fetch user to know the walletType
        const user = await this.userRepository.findOne({ where: { walletAddress } });
        if (!user) {
            throw new Error('User not found');
        }

        // Issue new token pair (rotates refresh token)
        return this.issueTokens(walletAddress, user.walletType);
    }

    /*
     * Invalidate the current session for the user.
     */
    async logout(walletAddress: string): Promise<void> {
        await this.redis.del(`auth:refresh:${walletAddress}`);
    }

    async generateBiometricRegistrationOptions(
        walletAddress: string
    ): Promise<WebAuthnRegistrationOptions> {
        const challenge = crypto.randomBytes(32);
        const challengeB64 = arrayBufferToBase64url(challenge);

        const user = await this.userRepository.findOne({ where: { walletAddress } });
        if (!user) {
            throw new Error('User not found');
        }

        const rpId = new URL(config.corsOrigin).hostname;

        await this.redis.set(
            `webauthn:reg:${walletAddress}`,
            challengeB64,
            'EX',
            300
        );

        return {
            challenge: challengeB64,
            rp: { name: 'Traqora', id: rpId },
            user: {
                id: arrayBufferToBase64url(Buffer.from(walletAddress)),
                name: walletAddress,
                displayName: walletAddress.slice(0, 12),
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },
                { type: 'public-key', alg: -257 },
            ],
            timeout: 60000,
            attestation: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                residentKey: 'preferred',
                userVerification: 'required',
            },
        };
    }

    async registerBiometricCredential(
        walletAddress: string,
        credential: {
            id: string;
            rawId: string;
            type: 'public-key';
            response: {
                clientDataJSON: string;
                attestationObject: string;
                transports?: AuthenticatorTransport[];
            };
        },
        deviceName?: string
    ): Promise<BiometricCredentialInfo> {
        const expectedChallenge = await this.redis.get(`webauthn:reg:${walletAddress}`);
        if (!expectedChallenge) {
            throw new Error('Registration challenge not found or expired');
        }

        await this.redis.del(`webauthn:reg:${walletAddress}`);

        const clientDataBuf = base64urlToBuffer(credential.response.clientDataJSON);
        const clientData = JSON.parse(clientDataBuf.toString('utf8'));

        if (clientData.type !== 'webauthn.create') {
            throw new Error('Invalid client data type');
        }

        const attestationBuf = base64urlToBuffer(credential.response.attestationObject);
        const { authData } = this.parseAttestationObject(attestationBuf);

        const counter = authData.readUInt32BE(authData.length - 4);

        const existing = await this.biometricRepository.findOne({
            where: { credentialId: credential.id },
        });
        if (existing) {
            throw new Error('Credential already registered');
        }

        const credentialType = this.detectCredentialType(credential.id);

        const entity = new BiometricCredential();
        entity.walletAddress = walletAddress;
        entity.credentialId = credential.id;
        entity.publicKey = credential.response.attestationObject;
        entity.counter = counter;
        entity.credentialType = credentialType;
        entity.deviceName = deviceName || null;
        entity.transports = credential.response.transports
            ? JSON.stringify(credential.response.transports)
            : null;
        entity.isActive = true;
        entity.lastUsedAt = new Date();

        await this.biometricRepository.save(entity);

        return {
            id: entity.id,
            credentialId: entity.credentialId,
            type: entity.credentialType,
            deviceName: entity.deviceName,
            enrolledAt: entity.createdAt,
            lastUsedAt: entity.lastUsedAt,
        };
    }

    async generateBiometricAuthenticationOptions(
        walletAddress: string
    ): Promise<WebAuthnAuthenticationOptions> {
        const credentials = await this.biometricRepository.find({
            where: { walletAddress, isActive: true },
        });

        if (credentials.length === 0) {
            throw new Error('No biometric credentials enrolled');
        }

        const challenge = crypto.randomBytes(32);
        const challengeB64 = arrayBufferToBase64url(challenge);

        const rpId = new URL(config.corsOrigin).hostname;

        await this.redis.set(
            `webauthn:auth:${walletAddress}`,
            challengeB64,
            'EX',
            300
        );

        return {
            challenge: challengeB64,
            timeout: 60000,
            rpId,
            allowCredentials: credentials.map((cred) => ({
                type: 'public-key' as const,
                id: cred.credentialId,
                transports: cred.transports
                    ? (JSON.parse(cred.transports) as AuthenticatorTransport[])
                    : undefined,
            })),
            userVerification: 'required',
        };
    }

    async verifyBiometricAssertion(
        walletAddress: string,
        assertion: {
            id: string;
            rawId: string;
            type: 'public-key';
            response: {
                clientDataJSON: string;
                authenticatorData: string;
                signature: string;
                userHandle?: string;
            };
        }
    ): Promise<{ verified: boolean; credentialId: string }> {
        const expectedChallenge = await this.redis.get(`webauthn:auth:${walletAddress}`);
        if (!expectedChallenge) {
            throw new Error('Authentication challenge not found or expired');
        }

        await this.redis.del(`webauthn:auth:${walletAddress}`);

        const credential = await this.biometricRepository.findOne({
            where: { credentialId: assertion.id, walletAddress, isActive: true },
        });
        if (!credential) {
            throw new Error('Credential not found');
        }

        const clientDataJSON = base64urlToBuffer(assertion.response.clientDataJSON);
        const clientData = JSON.parse(clientDataJSON.toString('utf8'));

        if (clientData.type !== 'webauthn.get') {
            throw new Error('Invalid client data type');
        }

        const authenticatorData = base64urlToBuffer(assertion.response.authenticatorData);
        const signature = base64urlToBuffer(assertion.response.signature);

        const signedData = Buffer.concat([
            authenticatorData,
            Buffer.from(assertion.response.clientDataJSON),
        ]);

        const publicKey = this.extractPublicKeyFromAttestation(
            base64urlToBuffer(credential.publicKey)
        );

        const isValid = crypto.verify(
            null,
            signedData,
            publicKey,
            signature
        );

        if (!isValid) {
            throw new Error('Invalid biometric assertion signature');
        }

        const newCounter = authenticatorData.readUInt32BE(authenticatorData.length - 4);
        if (newCounter <= credential.counter) {
            throw new Error('Replayed credential detected');
        }

        credential.counter = newCounter;
        credential.lastUsedAt = new Date();
        await this.biometricRepository.save(credential);

        return { verified: true, credentialId: credential.id };
    }

    async getBiometricCredentials(
        walletAddress: string
    ): Promise<BiometricCredentialInfo[]> {
        const credentials = await this.biometricRepository.find({
            where: { walletAddress, isActive: true },
            order: { createdAt: 'DESC' },
        });

        return credentials.map((c) => ({
            id: c.id,
            credentialId: c.credentialId,
            type: c.credentialType,
            deviceName: c.deviceName,
            enrolledAt: c.createdAt,
            lastUsedAt: c.lastUsedAt,
        }));
    }

    async removeBiometricCredential(credentialId: string, walletAddress: string): Promise<void> {
        const credential = await this.biometricRepository.findOne({
            where: { id: credentialId, walletAddress },
        });
        if (!credential) {
            throw new Error('Credential not found');
        }
        credential.isActive = false;
        await this.biometricRepository.save(credential);
    }

    private parseAttestationObject(buffer: Buffer): { authData: Buffer } {
        let offset = 0;
        const fmtLength = buffer.readUInt16BE(offset);
        offset += 2 + fmtLength;

        offset += 16;

        const authDataLength = buffer.readUInt32BE(offset);
        offset += 4;
        const authData = buffer.subarray(offset, offset + authDataLength);

        return { authData };
    }

    private detectCredentialType(credentialId: string): 'fingerprint' | 'face' {
        const typeIndicator = credentialId.charCodeAt(0) % 2;
        return typeIndicator === 0 ? 'fingerprint' : 'face';
    }

    private extractPublicKeyFromAttestation(attestationBuffer: Buffer): crypto.KeyObject {
        const { authData } = this.parseAttestationObject(attestationBuffer);

        let offset = 0;
        offset += 32;

        const flags = authData[offset];
        offset += 1;

        offset += 4;

        const attestedCredentialData = flags & 0x40;
        if (!attestedCredentialData) {
            throw new Error('No attested credential data');
        }

        offset += 16;

        const credIdLength = authData.readUInt16BE(offset);
        offset += 2;

        offset += credIdLength;

        const coseKey = authData.subarray(offset);

        return this.importCosePublicKey(coseKey);
    }

    private importCosePublicKey(coseKey: Buffer): crypto.KeyObject {
        let offset = 0;
        const kty = coseKey.readUInt8(4);

        if (kty === 2) {
            offset = coseKey[0] === 0xa5 ? 7 : 6;

            while (offset < coseKey.length) {
                const label = coseKey.readUInt8(offset);
                if (label === -1) {
                    offset += coseKey[offset] === 0x3b ? 3 : 2;
                    const crv = coseKey.readUInt8(offset);
                    offset += 1;
                    if (crv === 1) {
                        while (offset < coseKey.length) {
                            const xLabel = coseKey.readUInt8(offset);
                            offset += coseKey[offset] === 0x3b ? 3 : 2;
                            if (xLabel === -2) {
                                const xLen = coseKey.readUInt8(offset);
                                offset += 1;
                                const x = coseKey.subarray(offset, offset + xLen);
                                offset += xLen;
                                while (offset < coseKey.length) {
                                    const yLabel = coseKey.readUInt8(offset);
                                    offset += coseKey[offset] === 0x3b ? 3 : 2;
                                    if (yLabel === -3) {
                                        const yLen = coseKey.readUInt8(offset);
                                        offset += 1;
                                        const y = coseKey.subarray(offset, offset + yLen);

                                        const point = Buffer.concat([
                                            Buffer.from([0x04]),
                                            x,
                                            y,
                                        ]);

                                        return crypto.createPublicKey({
                                            key: point,
                                            format: 'der',
                                            type: 'spki',
                                        });
                                    }
                                }
                            }
                        }
                    }
                } else {
                    offset += 1;
                }
            }
        }

        if (kty === 3) {
            let n: Buffer | null = null;
            let e: Buffer | null = null;
            offset = coseKey[0] === 0xa5 ? 7 : 6;

            while (offset < coseKey.length && (!n || !e)) {
                const label = coseKey.readUInt8(offset);
                offset += coseKey[offset] === 0x3b ? 3 : 2;

                if (label === -1) {
                    const len = coseKey.readUInt8(offset);
                    offset += 1;
                    n = coseKey.subarray(offset, offset + len);
                    offset += len;
                } else if (label === -2) {
                    const len = coseKey.readUInt8(offset);
                    offset += 1;
                    e = coseKey.subarray(offset, offset + len);
                    offset += len;
                } else {
                    const len = coseKey.readUInt8(offset);
                    offset += 1 + len;
                }
            }

            if (n && e) {
                const der = Buffer.concat([
                    Buffer.from('3082010a0282010100', 'hex'),
                    n,
                    Buffer.from('0203010001', 'hex'),
                ]);

                return crypto.createPublicKey({
                    key: der,
                    format: 'der',
                    type: 'spki',
                });
            }
        }

        throw new Error('Unsupported COSE key type');
    }

    // Exposed for testing
    async disconnect(): Promise<void> {
        await this.redis.quit();
    }
}
