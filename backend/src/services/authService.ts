import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { User } from '../db/entities/User';
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

export class AuthService {
    private redis: Redis;
    private userRepository: Repository<User>;

    constructor(dataSource: DataSource, redisUrl: string = config.redisUrl) {
        // If we're strictly testing without Redis, we might want a mock, but for prod use this
        this.redis = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
        });
        this.userRepository = dataSource.getRepository(User);
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
    private async issueTokens(walletAddress: string, walletType: string): Promise<VerifyResponse> {
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

    // Exposed for testing
    async disconnect(): Promise<void> {
        await this.redis.quit();
    }
}
