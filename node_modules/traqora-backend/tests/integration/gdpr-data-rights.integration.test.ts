import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { config } from '../../src/config';
import { AccountDeletionRequest } from '../../src/db/entities/AccountDeletionRequest';
import { ConsentRecord } from '../../src/db/entities/ConsentRecord';

const WALLET = 'GDATAEXPORTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER_WALLET = 'GOTHERUSERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const token = jwt.sign({ walletAddress: WALLET, walletType: 'freighter' }, config.jwtSecret, {
  expiresIn: '1h',
});
const otherToken = jwt.sign({ walletAddress: OTHER_WALLET, walletType: 'freighter' }, config.jwtSecret, {
  expiresIn: '1h',
});

describe('GDPR data export and deletion requests (issue #386)', () => {
  let app: import('express').Express;

  beforeAll(async () => {
    await initDataSource();
    app = await createApp({ globalRateLimit: false, tieredRateLimit: false });
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  describe('GET /users/me/data-export', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/users/me/data-export');
      expect(res.status).toBe(401);
    });

    it('returns a downloadable JSON export with the account record', async () => {
      // Ensure the account exists first.
      await request(app).get('/api/v1/users/me').set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .get('/api/v1/users/me/data-export')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['content-disposition']).toContain(WALLET);

      const payload = JSON.parse(res.text);
      expect(payload.userId).toBe(WALLET);
      expect(payload.account.walletAddress).toBe(WALLET);
      expect(payload.omitted).toBeDefined();
    });
  });

  describe('POST /users/me/deletion-request', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).post('/api/v1/users/me/deletion-request');
      expect(res.status).toBe(401);
    });

    it('creates a pending deletion request', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'no longer using the service' });

      expect(res.status).toBe(202);
      expect(res.body.data.status).toBe('pending');
      expect(res.body.alreadyPending).toBe(false);

      const repo = AppDataSource.getRepository(AccountDeletionRequest);
      const stored = await repo.findOne({ where: { userId: WALLET } });
      expect(stored).not.toBeNull();
      expect(stored!.reason).toBe('no longer using the service');
    });

    it('returns the existing request instead of creating a duplicate when one is already pending', async () => {
      const first = await request(app)
        .post('/api/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      const second = await request(app)
        .post('/api/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(second.status).toBe(200);
      expect(second.body.alreadyPending).toBe(true);
      expect(second.body.data.id).toBe(first.body.data.id);
    });

    it('rejects a reason longer than 1000 characters', async () => {
      const res = await request(app)
        .post('/api/v1/users/me/deletion-request')
        .set('Authorization', `Bearer ${token}`)
        .send({ reason: 'x'.repeat(1001) });

      expect(res.status).toBe(400);
    });
  });

  describe('consent management (#549)', () => {
    afterEach(async () => {
      // Each test's grant/withdraw calls persist real rows — clear them so
      // consent-type upsert behaviour (grantConsent updates the existing
      // row for a type rather than inserting a new one) doesn't leak
      // state between tests.
      const repo = AppDataSource.getRepository(ConsentRecord);
      await repo.delete({ userWalletAddress: WALLET });
      await repo.delete({ userWalletAddress: OTHER_WALLET });
    });

    describe('GET /users/me/consent', () => {
      it('rejects unauthenticated requests', async () => {
        const res = await request(app).get('/api/v1/users/me/consent');
        expect(res.status).toBe(401);
      });

      it('returns an empty list before any consent has been granted', async () => {
        const res = await request(app)
          .get('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
      });
    });

    describe('POST /users/me/consent', () => {
      it('rejects unauthenticated requests', async () => {
        const res = await request(app)
          .post('/api/v1/users/me/consent')
          .send({ consentType: 'marketing', consentDetails: 'v1 of the marketing consent notice' });
        expect(res.status).toBe(401);
      });

      it('grants consent and records it against the authenticated wallet, not a client-supplied one', async () => {
        const res = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'marketing', consentDetails: 'v1 of the marketing consent notice' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('granted');
        expect(res.body.data.userWalletAddress).toBe(WALLET);

        const stored = await AppDataSource.getRepository(ConsentRecord).findOne({
          where: { userWalletAddress: WALLET, consentType: 'marketing' },
        });
        expect(stored).not.toBeNull();
        expect(stored!.status).toBe('granted');
      });

      it('is idempotent per consentType: granting an already-granted type updates the same row', async () => {
        const first = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'analytics', consentDetails: 'v1' });

        const second = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'analytics', consentDetails: 'v2, updated wording' });

        expect(second.body.data.id).toBe(first.body.data.id);
        expect(second.body.data.consentDetails).toBe('v2, updated wording');

        const all = await AppDataSource.getRepository(ConsentRecord).find({
          where: { userWalletAddress: WALLET, consentType: 'analytics' },
        });
        expect(all).toHaveLength(1);
      });

      it('rejects an invalid consentType', async () => {
        const res = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'not_a_real_type', consentDetails: 'x' });
        expect(res.status).toBe(400);
      });

      it('rejects an empty consentDetails', async () => {
        const res = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'marketing', consentDetails: '' });
        expect(res.status).toBe(400);
      });
    });

    describe('DELETE /users/me/consent/:consentId', () => {
      it('rejects unauthenticated requests', async () => {
        const res = await request(app).delete('/api/v1/users/me/consent/00000000-0000-0000-0000-000000000000');
        expect(res.status).toBe(401);
      });

      it('withdraws the caller\'s own consent record', async () => {
        const grant = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'profiling', consentDetails: 'v1' });

        const res = await request(app)
          .delete(`/api/v1/users/me/consent/${grant.body.data.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ reason: 'no longer interested' });

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('withdrawn');
        expect(res.body.alreadyWithdrawn).toBe(false);

        const stored = await AppDataSource.getRepository(ConsentRecord).findOne({
          where: { id: grant.body.data.id },
        });
        expect(stored!.status).toBe('withdrawn');
        expect(stored!.withdrawalReason).toBe('no longer interested');
      });

      it('is idempotent: withdrawing an already-withdrawn record returns 200 without erroring', async () => {
        const grant = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'third_party_sharing', consentDetails: 'v1' });

        await request(app)
          .delete(`/api/v1/users/me/consent/${grant.body.data.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        const second = await request(app)
          .delete(`/api/v1/users/me/consent/${grant.body.data.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(second.status).toBe(200);
        expect(second.body.alreadyWithdrawn).toBe(true);
      });

      it('returns 404, not another user\'s data, when withdrawing a consent record owned by a different user', async () => {
        // OTHER_WALLET grants a consent record...
        const otherGrant = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${otherToken}`)
          .send({ consentType: 'data_processing', consentDetails: 'v1' });

        // ...and WALLET must not be able to withdraw it by guessing/knowing its id.
        // This is the exact authorization gap found in governance.ts's
        // equivalent (unmounted, unauthenticated) routes.
        const res = await request(app)
          .delete(`/api/v1/users/me/consent/${otherGrant.body.data.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({});

        expect(res.status).toBe(404);

        const stillGranted = await AppDataSource.getRepository(ConsentRecord).findOne({
          where: { id: otherGrant.body.data.id },
        });
        expect(stillGranted!.status).toBe('granted');
      });

      it('returns 404 for a nonexistent consentId', async () => {
        const res = await request(app)
          .delete('/api/v1/users/me/consent/00000000-0000-0000-0000-000000000000')
          .set('Authorization', `Bearer ${token}`)
          .send({});
        expect(res.status).toBe(404);
      });

      it('rejects a withdrawal reason longer than 1000 characters', async () => {
        const grant = await request(app)
          .post('/api/v1/users/me/consent')
          .set('Authorization', `Bearer ${token}`)
          .send({ consentType: 'marketing', consentDetails: 'v1' });

        const res = await request(app)
          .delete(`/api/v1/users/me/consent/${grant.body.data.id}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ reason: 'x'.repeat(1001) });

        expect(res.status).toBe(400);
      });
    });
  });
});
