import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Redis from 'ioredis';
import { authRoutes } from '../../src/api/routes/auth';
import { AppDataSource } from '../../src/db/dataSource';
import { config } from '../../src/config';
import { errorHandler } from '../../src/utils/errorHandler';

/*
 * ioredis-mock isolates its store per instance, but the auth routes create a
 * fresh AuthService (and therefore a fresh Redis connection) on every request.
 * Return one shared RedisMock from the constructor so state (challenges,
 * refresh-token hashes) persists across HTTP requests within a test.
 */
jest.mock('ioredis', () => {
    const RedisMock = require('ioredis-mock');
    let shared: any = null;
    class SharedRedis {
        constructor(_url?: string, _options?: any) {
            if (!shared) {
                shared = new RedisMock();
            }
            return shared;
        }
    }
    return {
        __esModule: true,
        default: SharedRedis,
        Redis: SharedRedis,
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

jest.mock('../../src/db/dataSource', () => {
    return {
        AppDataSource: {
            getRepository: jest.fn(),
        },
    };
});

// Prevent the production error handler from initializing @sentry/profiling-node
// (native binary does not load on macOS) while still exercising the real handler.
jest.mock('../../src/services/errorTracking', () => {
    return {
        captureException: jest.fn(),
        scrubEvent: jest.fn(),
    };
});

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    return app;
}

// Sign a refresh token with an explicit iat in the past so it can never collide
// with a token freshly issued by the service (JWT has second-level granularity).
function pastRefreshToken(iatOffsetSeconds = 60): string {
    const iat = Math.floor(Date.now() / 1000) - iatOffsetSeconds;
    return jwt.sign({ walletAddress: WALLET, iat }, config.jwtRefreshSecret, {
        subject: WALLET,
        expiresIn: '7d',
    });
}

function sha256(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function accessToken(expiresIn: string | number = '1h'): string {
    return jwt.sign({ walletAddress: WALLET, walletType: 'freighter' }, config.jwtSecret, {
        subject: WALLET,
        expiresIn,
    });
}

describe('Auth token rotation and refresh flows', () => {
    let app: express.Application;
    let sharedRedis: any;
    let userRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };

    beforeAll(async () => {
        userRepo = {
            findOne: jest.fn().mockResolvedValue({ walletAddress: WALLET, walletType: 'freighter' }),
            create: jest.fn((user: any) => user),
            save: jest.fn(async (user: any) => user),
        };
        (AppDataSource.getRepository as jest.Mock).mockReturnValue(userRepo);
        sharedRedis = new (Redis as any)();
        app = buildApp();
    });

    beforeEach(async () => {
        await sharedRedis.flushall();
        jest.clearAllMocks();
        userRepo.findOne.mockResolvedValue({ walletAddress: WALLET, walletType: 'freighter' });
    });

    describe('JWT access/refresh issuance flow', () => {
        it('issues an access/refresh pair via challenge+verify and lets the access token reach a protected route', async () => {
            await request(app)
                .post('/auth/challenge')
                .send({ walletAddress: WALLET })
                .expect(200)
                .expect((res) => {
                    expect(res.body.nonce).toHaveLength(64);
                });

            let tokens: any;
            await request(app)
                .post('/auth/verify')
                .send({ walletAddress: WALLET, signature: 'valid_signature', walletType: 'freighter' })
                .expect(200)
                .expect((res) => {
                    tokens = res.body;
                    expect(tokens.accessToken).toBeDefined();
                    expect(tokens.refreshToken).toBeDefined();
                    expect(tokens.walletAddress).toBe(WALLET);
                });

            const decoded = jwt.verify(tokens.accessToken, config.jwtSecret) as any;
            expect(decoded.walletAddress).toBe(WALLET);
            expect(decoded.sub).toBe(WALLET);

            await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${tokens.accessToken}`)
                .send({})
                .expect(200)
                .expect({ message: 'Logged out successfully' });
        });

        it('stores a hash of the issued refresh token so it can be validated later', async () => {
            const { WalletAuthFactory } = require('../../src/services/WalletSignatureAdapter');
            (WalletAuthFactory.getAdapter as jest.Mock).mockReturnValue({
                verify: jest.fn().mockResolvedValue(true),
            });

            await request(app).post('/auth/challenge').send({ walletAddress: WALLET }).expect(200);

            let tokens: any;
            await request(app)
                .post('/auth/verify')
                .send({ walletAddress: WALLET, signature: 'valid_signature', walletType: 'freighter' })
                .expect(200)
                .expect((res) => (tokens = res.body));

            const storedHash = await sharedRedis.get(`auth:refresh:${WALLET}`);
            expect(storedHash).toBe(sha256(tokens.refreshToken));
        });
    });

    describe('refresh token rotation and reuse detection', () => {
        it('rotates the refresh token and rejects the rotated-out token on reuse', async () => {
            const old = pastRefreshToken();
            await sharedRedis.set(`auth:refresh:${WALLET}`, sha256(old));

            let pair: any;
            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: old })
                .expect(200)
                .expect((res) => {
                    pair = res.body;
                    expect(pair.refreshToken).toBeDefined();
                    expect(pair.refreshToken).not.toBe(old);
                });

            const storedHash = await sharedRedis.get(`auth:refresh:${WALLET}`);
            expect(storedHash).toBe(sha256(pair.refreshToken));

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: old })
                .expect(401)
                .expect((res) => {
                    expect(res.body.code).toBe('UNAUTHORIZED');
                    expect(res.body.error).toBe('Refresh token revoked or mismatched');
                });
        });

        it('keeps the newest refresh token valid after rotation', async () => {
            const old = pastRefreshToken();
            await sharedRedis.set(`auth:refresh:${WALLET}`, sha256(old));

            let pair: any;
            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: old })
                .expect(200)
                .expect((res) => (pair = res.body));

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: pair.refreshToken })
                .expect(200);
        });

        it('rejects every rotated-out generation after repeated rotation', async () => {
            // Emulate a 3-generation refresh chain (each rotation replaced the
            // stored hash with the next generation's). Only the current
            // generation may be refreshed; all earlier ones are rejected.
            const gen1 = pastRefreshToken(300);
            const gen2 = pastRefreshToken(200);
            const gen3 = pastRefreshToken(100);

            await sharedRedis.set(`auth:refresh:${WALLET}`, sha256(gen3));

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: gen1 })
                .expect(401)
                .expect((res) => {
                    expect(res.body.error).toBe('Refresh token revoked or mismatched');
                });

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: gen2 })
                .expect(401);

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: gen3 })
                .expect(200);
        });

        it('never reissues from a token that is validly signed but no longer stored', async () => {
            const signedButUnstored = pastRefreshToken();

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: signedButUnstored })
                .expect(401)
                .expect((res) => {
                    expect(res.body.code).toBe('UNAUTHORIZED');
                    expect(res.body.error).toBe('Refresh token revoked or mismatched');
                });
        });
    });

    describe('refresh token revocation', () => {
        it('invalidates the refresh token on logout', async () => {
            const old = pastRefreshToken();
            await sharedRedis.set(`auth:refresh:${WALLET}`, sha256(old));

            await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${accessToken()}`)
                .send({})
                .expect(200);

            expect(await sharedRedis.get(`auth:refresh:${WALLET}`)).toBeNull();

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: old })
                .expect(401);
        });

        it('returns 401 for an expired refresh token', async () => {
            const expired = jwt.sign({ walletAddress: WALLET, iat: Math.floor(Date.now() / 1000) - 100 }, config.jwtRefreshSecret, {
                subject: WALLET,
                expiresIn: '-1s',
            });

            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: expired })
                .expect(401)
                .expect((res) => {
                    expect(res.body.error).toBe('Invalid or expired refresh token');
                });
        });

        it('returns 401 for a garbage or wrong-secret refresh token', async () => {
            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: 'not-a-jwt' })
                .expect(401)
                .expect((res) => {
                    expect(res.body.error).toBe('Invalid or expired refresh token');
                });

            const wrongSecret = jwt.sign({ walletAddress: WALLET }, config.jwtSecret, { subject: WALLET });
            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: wrongSecret })
                .expect(401);
        });

        it('returns 401 when no refresh token is supplied', async () => {
            await request(app)
                .post('/auth/refresh')
                .send({})
                .expect(401);
        });
    });

    describe('proper 401 responses on protected routes', () => {
        it('rejects missing, malformed, invalid and expired access tokens with 401 + specific codes', async () => {
            await request(app)
                .post('/auth/logout')
                .send({})
                .expect(401)
                .expect((res) => expect(res.body.error.code).toBe('TOKEN_MISSING'));

            await request(app)
                .post('/auth/logout')
                .set('Authorization', 'Basic basiccreds')
                .send({})
                .expect(401)
                .expect((res) => expect(res.body.error.code).toBe('TOKEN_MISSING'));

            await request(app)
                .post('/auth/logout')
                .set('Authorization', 'Bearer not.a.real.token')
                .send({})
                .expect(401)
                .expect((res) => expect(res.body.error.code).toBe('TOKEN_INVALID'));

            await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${accessToken('-1s')}`)
                .send({})
                .expect(401)
                .expect((res) => expect(res.body.error.code).toBe('TOKEN_EXPIRED'));

            await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${accessToken()}`)
                .send({})
                .expect(200);
        });

        it('does not accept a refresh token as an access token', async () => {
            const refreshToken = jwt.sign({ walletAddress: WALLET }, config.jwtRefreshSecret, { subject: WALLET });

            await request(app)
                .post('/auth/logout')
                .set('Authorization', `Bearer ${refreshToken}`)
                .send({})
                .expect(401)
                .expect((res) => expect(res.body.error.code).toBe('TOKEN_INVALID'));
        });

        it('maps every revoked/expired/reused refresh attempt to 401, never 200 or 500', async () => {
            const old = pastRefreshToken();
            await sharedRedis.set(`auth:refresh:${WALLET}`, sha256(old));
            await request(app)
                .post('/auth/refresh')
                .send({ refreshToken: old })
                .expect(200);

            const attempts = [
                { refreshToken: old },
                { refreshToken: 'garbage' },
                {},
            ];
            for (const body of attempts) {
                const res = await request(app).post('/auth/refresh').send(body);
                expect(res.status).toBe(401);
                expect(res.body.success).toBe(false);
            }
        });
    });
});