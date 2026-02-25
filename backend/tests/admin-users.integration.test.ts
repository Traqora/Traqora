import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Passenger } from '../src/db/entities/Passenger';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

describe('Admin Users Management', () => {
    let passengerId: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();
        const repo = AppDataSource.getRepository(Passenger);
        const p = await repo.save(
            repo.create({
                email: 'test-user@example.com',
                firstName: 'Test',
                lastName: 'User',
                sorobanAddress: 'GTEST',
            })
        );
        passengerId = p.id;
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('GET /api/v1/admin/users lists passengers', async () => {
        const res = await request(app).get('/api/v1/admin/users').set(KEY).expect(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.passengers)).toBe(true);
        expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/admin/users supports email filter', async () => {
        const res = await request(app)
            .get('/api/v1/admin/users?email=test-user')
            .set(KEY)
            .expect(200);
        expect(res.body.data.passengers.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/admin/users/:id returns passenger', async () => {
        const res = await request(app).get(`/api/v1/admin/users/${passengerId}`).set(KEY).expect(200);
        expect(res.body.data.id).toBe(passengerId);
        expect(res.body.data.email).toBe('test-user@example.com');
    });

    it('GET /api/v1/admin/users/:id returns 404 for unknown id', async () => {
        await request(app)
            .get('/api/v1/admin/users/00000000-0000-0000-0000-000000000000')
            .set(KEY)
            .expect(404);
    });

    it('DELETE /api/v1/admin/users/:id removes passenger (204)', async () => {
        await request(app).delete(`/api/v1/admin/users/${passengerId}`).set(KEY).expect(204);
        await request(app).get(`/api/v1/admin/users/${passengerId}`).set(KEY).expect(404);
    });
});
