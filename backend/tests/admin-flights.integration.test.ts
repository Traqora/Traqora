import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

const flightBody = {
    flightNumber: 'TQ-A01',
    fromAirport: 'LOS',
    toAirport: 'LHR',
    departureTime: new Date(Date.now() + 86400 * 1000).toISOString(),
    seatsAvailable: 50,
    priceCents: 25000,
    airlineSorobanAddress: 'GAAIRLINE123',
};

describe('Admin Flights CRUD', () => {
    let flightId: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('POST /api/v1/admin/flights creates a flight (201)', async () => {
        const res = await request(app)
            .post('/api/v1/admin/flights')
            .set(KEY)
            .send(flightBody)
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data.flightNumber).toBe('TQ-A01');
        flightId = res.body.data.id;
    });

    it('GET /api/v1/admin/flights lists flights', async () => {
        const res = await request(app).get('/api/v1/admin/flights').set(KEY).expect(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.flights)).toBe(true);
        expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/admin/flights/:id retrieves the flight', async () => {
        const res = await request(app).get(`/api/v1/admin/flights/${flightId}`).set(KEY).expect(200);
        expect(res.body.data.id).toBe(flightId);
    });

    it('GET /api/v1/admin/flights/:id returns 404 for unknown id', async () => {
        await request(app)
            .get('/api/v1/admin/flights/00000000-0000-0000-0000-000000000000')
            .set(KEY)
            .expect(404);
    });

    it('PUT /api/v1/admin/flights/:id updates the flight', async () => {
        const res = await request(app)
            .put(`/api/v1/admin/flights/${flightId}`)
            .set(KEY)
            .send({ seatsAvailable: 99 })
            .expect(200);
        expect(res.body.data.seatsAvailable).toBe(99);
    });

    it('DELETE /api/v1/admin/flights/:id removes the flight (204)', async () => {
        await request(app).delete(`/api/v1/admin/flights/${flightId}`).set(KEY).expect(204);
        await request(app).get(`/api/v1/admin/flights/${flightId}`).set(KEY).expect(404);
    });
});
