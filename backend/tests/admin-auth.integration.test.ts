import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { AdminUser } from '../src/db/entities/AdminUser';

const VALID_KEY = 'dev-admin-key';

describe('Admin Auth', () => {
    let adminToken: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();

        const repo = AppDataSource.getRepository(AdminUser);
        const hash = await bcrypt.hash('password123', 10);
        await repo.save(
            repo.create({ email: 'admin@traqora.io', passwordHash: hash, role: 'admin' })
        );
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('rejects requests with no credentials (401)', async () => {
        await request(app).get('/api/v1/admin/flights').expect(401);
    });

    it('accepts valid X-Admin-Api-Key', async () => {
        await request(app)
            .get('/api/v1/admin/flights')
            .set('X-Admin-Api-Key', VALID_KEY)
            .expect(200);
    });

    it('rejects invalid X-Admin-Api-Key (401)', async () => {
        await request(app)
            .get('/api/v1/admin/flights')
            .set('X-Admin-Api-Key', 'wrong-key')
            .expect(401);
    });

    it('issues a JWT via login endpoint', async () => {
        const res = await request(app)
            .post('/api/v1/admin/auth/login')
            .send({ email: 'admin@traqora.io', password: 'password123' })
            .expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeTruthy();
        adminToken = res.body.data.token;
    });

    it('rejects wrong password (401)', async () => {
        await request(app)
            .post('/api/v1/admin/auth/login')
            .send({ email: 'admin@traqora.io', password: 'wrongpassword' })
            .expect(401);
    });

    it('accepts valid Bearer JWT', async () => {
        await request(app)
            .get('/api/v1/admin/flights')
            .set('Authorization', `Bearer ${adminToken}`)
            .expect(200);
    });

    it('rejects tampered/invalid JWT (401)', async () => {
        await request(app)
            .get('/api/v1/admin/flights')
            .set('Authorization', 'Bearer totally.invalid.token')
            .expect(401);
    });

    it('blocks support role from analytics (403)', async () => {
        const repo = AppDataSource.getRepository(AdminUser);
        const hash = await bcrypt.hash('pass', 10);
        const support = await repo.save(
            repo.create({ email: 'support@traqora.io', passwordHash: hash, role: 'support' })
        );

        const loginRes = await request(app)
            .post('/api/v1/admin/auth/login')
            .send({ email: 'support@traqora.io', password: 'pass' })
            .expect(200);

        await request(app)
            .get('/api/v1/admin/analytics')
            .set('Authorization', `Bearer ${loginRes.body.data.token}`)
            .expect(403);

        await repo.remove(support);
    });
});
