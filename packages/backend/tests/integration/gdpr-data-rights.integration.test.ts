import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { config } from '../../src/config';
import { AccountDeletionRequest } from '../../src/db/entities/AccountDeletionRequest';

const WALLET = 'GDATAEXPORTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const token = jwt.sign({ walletAddress: WALLET, walletType: 'freighter' }, config.jwtSecret, {
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
});
