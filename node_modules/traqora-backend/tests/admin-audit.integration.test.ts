import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { AdminAuditLog } from '../src/db/entities/AdminAuditLog';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

const flightBody = {
    flightNumber: 'TQ-E01',
    fromAirport: 'ACC',
    toAirport: 'LHR',
    departureTime: new Date(Date.now() + 86400 * 1000).toISOString(),
    seatsAvailable: 10,
    priceCents: 20000,
    airlineSorobanAddress: 'GAAUDIT',
};

/**
 * Wait for the async audit log write (which fires on res.finish).
 * A short delay is sufficient since the write is in-process with SQLite.
 */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Admin Audit Logging', () => {
    let createdFlightId: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('creates an audit log entry when a flight is created via admin API', async () => {
        const res = await request(app)
            .post('/api/v1/admin/flights')
            .set(KEY)
            .send(flightBody)
            .expect(201);

        createdFlightId = res.body.data.id;
        await wait(100); // allow async audit write to complete

        const repo = AppDataSource.getRepository(AdminAuditLog);
        const log = await repo.findOne({
            where: { action: 'FLIGHT_CREATED', resourceId: createdFlightId },
        });
        expect(log).toBeTruthy();
        expect(log!.resource).toBe('flights');
        expect(log!.adminEmail).toBe('system@traqora.io');
    });

    it('creates an audit log entry when a flight is deleted via admin API', async () => {
        await request(app)
            .delete(`/api/v1/admin/flights/${createdFlightId}`)
            .set(KEY)
            .expect(204);

        await wait(100);

        const repo = AppDataSource.getRepository(AdminAuditLog);
        const log = await repo.findOne({
            where: { action: 'FLIGHT_DELETED', resourceId: createdFlightId },
        });
        expect(log).toBeTruthy();
        expect(log!.resource).toBe('flights');
    });

    it('does NOT create an audit log entry for GET requests', async () => {
        const beforeCount = await AppDataSource.getRepository(AdminAuditLog).count();
        await request(app).get('/api/v1/admin/flights').set(KEY).expect(200);
        await wait(100);
        const afterCount = await AppDataSource.getRepository(AdminAuditLog).count();
        expect(afterCount).toBe(beforeCount);
    });
});
