import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { config } from '../../src/config';
import { LoyaltyStore } from '../../src/services/loyalty/store';
import { referralRoutes } from '../../src/api/routes/referrals';
import { emailService } from '../../src/services/EmailService';

jest.mock('../../src/services/EmailService', () => ({
  emailService: { send: jest.fn().mockResolvedValue(undefined) },
}));

// referralRoutes needs no DB — it's mounted directly on a bare app
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/referrals', referralRoutes);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 400).json({ error: err.message, details: err.details });
  });
  return app;
}

const WALLET_A = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const WALLET_B = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function tokenFor(walletAddress: string) {
  return jwt.sign({ walletAddress, walletType: 'freighter' }, config.jwtSecret, { expiresIn: '1h' });
}

describe('referral program routes (issue #377)', () => {
  let app: express.Express;

  beforeEach(() => {
    LoyaltyStore.resetForTesting();
    jest.clearAllMocks();
    app = buildApp();
  });

  describe('POST /codes', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/v1/referrals/codes');
      expect(res.status).toBe(401);
    });

    it('generates a code on first call', async () => {
      const res = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      expect(res.status).toBe(201);
      expect(res.body.existing).toBe(false);
      expect(res.body.referralCode).toMatch(/^REF-/);
    });

    it('returns the same code on subsequent calls (persists across requests)', async () => {
      const first = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);
      const second = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      expect(second.status).toBe(200);
      expect(second.body.existing).toBe(true);
      expect(second.body.referralCode).toBe(first.body.referralCode);
    });

    it('generates distinct codes for distinct users', async () => {
      const a = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);
      const b = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_B)}`);

      expect(a.body.referralCode).not.toBe(b.body.referralCode);
    });
  });

  describe('POST /invite', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app)
        .post('/api/v1/referrals/invite')
        .send({ email: 'friend@example.com' });
      expect(res.status).toBe(401);
    });

    it('rejects an invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/referrals/invite')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`)
        .send({ email: 'not-an-email' });
      expect(res.status).toBe(400);
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('sends an invite email with the referral code and returns 202', async () => {
      const res = await request(app)
        .post('/api/v1/referrals/invite')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`)
        .send({ email: 'friend@example.com', inviterName: 'Ada' });

      expect(res.status).toBe(202);
      expect(res.body.invited).toBe(true);
      expect(res.body.referralCode).toMatch(/^REF-/);

      expect(emailService.send).toHaveBeenCalledWith(
        'friend@example.com',
        'referral-invite',
        expect.objectContaining({
          inviterName: 'Ada',
          referralCode: res.body.referralCode,
          inviteUrl: expect.stringContaining(encodeURIComponent(res.body.referralCode)),
        }),
      );
    });

    it('reuses the same code across /codes and /invite for the same user', async () => {
      const codesRes = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);
      const inviteRes = await request(app)
        .post('/api/v1/referrals/invite')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`)
        .send({ email: 'friend@example.com' });

      expect(inviteRes.body.referralCode).toBe(codesRes.body.referralCode);
    });
  });

  describe('GET /dashboard', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/referrals/dashboard');
      expect(res.status).toBe(401);
    });

    it('returns zeroed stats before any activity', async () => {
      const res = await request(app)
        .get('/api/v1/referrals/dashboard')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      expect(res.status).toBe(200);
      expect(res.body.referralCode).toBeNull();
      expect(res.body.stats).toEqual({
        totalClicks: 0,
        totalConversions: 0,
        pendingPoints: 0,
        earnedPoints: 0,
        referees: [],
      });
    });
  });

  describe('POST /track', () => {
    it('rejects a malformed body', async () => {
      const res = await request(app).post('/api/v1/referrals/track').send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 for an unknown referral code', async () => {
      const res = await request(app)
        .post('/api/v1/referrals/track')
        .send({ referralCode: 'REF-UNKNOWN-CODE1' });
      expect(res.status).toBe(404);
    });

    it('rejects a self-referral by matching IP', async () => {
      const codesRes = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      // supertest requests hit the app over loopback, so req.ip resolves to
      // the IPv4-mapped IPv6 form — matching that is what makes this a
      // same-IP (self-referral) request in practice.
      const res = await request(app)
        .post('/api/v1/referrals/track')
        .send({ referralCode: codesRes.body.referralCode, refereeIp: '::ffff:127.0.0.1' });

      expect(res.status).toBe(400);
    });

    it('increments totalClicks on the referrer dashboard', async () => {
      const codesRes = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      await request(app)
        .post('/api/v1/referrals/track')
        .send({ referralCode: codesRes.body.referralCode, refereeIp: '203.0.113.5' });
      await request(app)
        .post('/api/v1/referrals/track')
        .send({ referralCode: codesRes.body.referralCode, refereeIp: '203.0.113.6' });

      const dashboard = await request(app)
        .get('/api/v1/referrals/dashboard')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      expect(dashboard.body.stats.totalClicks).toBe(2);
    });
  });

  describe('POST /convert', () => {
    async function makeCode(wallet: string) {
      const res = await request(app)
        .post('/api/v1/referrals/codes')
        .set('Authorization', `Bearer ${tokenFor(wallet)}`);
      return res.body.referralCode as string;
    }

    it('returns 404 for an unknown referral code', async () => {
      const res = await request(app)
        .post('/api/v1/referrals/convert')
        .send({ referralCode: 'REF-UNKNOWN-CODE1', refereeId: 'referee-1', bookingId: 'bk_1', bookingValue: 100 });
      expect(res.status).toBe(404);
    });

    it('rejects a self-referral (referee is the referrer)', async () => {
      const code = await makeCode(WALLET_A);
      const res = await request(app)
        .post('/api/v1/referrals/convert')
        .send({ referralCode: code, refereeId: WALLET_A, bookingId: 'bk_1', bookingValue: 100 });
      expect(res.status).toBe(400);
    });

    it('awards points and persists the conversion, incrementing dashboard stats', async () => {
      const code = await makeCode(WALLET_A);

      const res = await request(app)
        .post('/api/v1/referrals/convert')
        .send({ referralCode: code, refereeId: 'referee-1', bookingId: 'bk_1', bookingValue: 250 });

      expect(res.status).toBe(201);
      expect(res.body.referrerPointsAwarded).toBe(500); // bronze tier, multiplier 1
      expect(res.body.refereePointsAwarded).toBe(100);

      const dashboard = await request(app)
        .get('/api/v1/referrals/dashboard')
        .set('Authorization', `Bearer ${tokenFor(WALLET_A)}`);

      expect(dashboard.body.stats.totalConversions).toBe(1);
      expect(dashboard.body.stats.earnedPoints).toBe(500);
      expect(dashboard.body.stats.referees).toEqual(['referee-1']);
    });

    it('rejects a duplicate conversion for the same referee (fraud guard)', async () => {
      const code = await makeCode(WALLET_A);
      await request(app)
        .post('/api/v1/referrals/convert')
        .send({ referralCode: code, refereeId: 'referee-1', bookingId: 'bk_1', bookingValue: 250 });

      const res = await request(app)
        .post('/api/v1/referrals/convert')
        .send({ referralCode: code, refereeId: 'referee-1', bookingId: 'bk_2', bookingValue: 300 });

      expect(res.status).toBe(409);
    });
  });
});
