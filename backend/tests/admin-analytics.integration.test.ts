import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Passenger } from '../src/db/entities/Passenger';
import { Booking } from '../src/db/entities/Booking';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

describe('Admin Analytics', () => {
    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();

        const flightRepo = AppDataSource.getRepository(Flight);
        const passengerRepo = AppDataSource.getRepository(Passenger);
        const bookingRepo = AppDataSource.getRepository(Booking);

        const flight = await flightRepo.save(
            flightRepo.create({
                flightNumber: 'TQ-C01',
                fromAirport: 'ABJ',
                toAirport: 'CDG',
                departureTime: new Date(Date.now() + 86400 * 1000),
                seatsAvailable: 5,
                priceCents: 50000,
                airlineSorobanAddress: 'GAANALYTICS',
            })
        );
        const passenger = await passengerRepo.save(
            passengerRepo.create({
                email: 'analytics-user@example.com',
                firstName: 'Ana',
                lastName: 'Lytics',
                sorobanAddress: 'GANALYTICS',
            })
        );
        await bookingRepo.save(
            bookingRepo.create({
                flight,
                passenger,
                status: 'confirmed',
                amountCents: 50000,
                idempotencyKey: 'analytics-idem-1',
            })
        );
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('GET /api/v1/admin/analytics returns data shape', async () => {
        const res = await request(app).get('/api/v1/admin/analytics').set(KEY).expect(200);
        expect(res.body.success).toBe(true);
        const d = res.body.data;
        expect(typeof d.totalBookings).toBe('number');
        expect(typeof d.totalRevenueCents).toBe('number');
        expect(typeof d.averageFareCents).toBe('number');
        expect(typeof d.bookingsByStatus).toBe('object');
        expect(typeof d.totalFlights).toBe('number');
        expect(typeof d.totalPassengers).toBe('number');
    });

    it('analytics totals are non-negative and consistent', async () => {
        const res = await request(app).get('/api/v1/admin/analytics').set(KEY).expect(200);
        const d = res.body.data;
        expect(d.totalBookings).toBeGreaterThanOrEqual(1);
        expect(d.totalFlights).toBeGreaterThanOrEqual(1);
        expect(d.totalPassengers).toBeGreaterThanOrEqual(1);
        // confirmed bookings should raise revenue
        expect(d.totalRevenueCents).toBeGreaterThan(0);
        expect(d.bookingsByStatus.confirmed).toBeGreaterThanOrEqual(1);
    });

    it('support role is blocked from analytics (403)', async () => {
        const bcrypt = await import('bcryptjs');
        const { AdminUser } = await import('../src/db/entities/AdminUser');
        const repo = AppDataSource.getRepository(AdminUser);
        const hash = await bcrypt.hash('pass', 10);
        const support = await repo.save(
            repo.create({ email: 'support2@traqora.io', passwordHash: hash, role: 'support' })
        );
        const loginRes = await request(app)
            .post('/api/v1/admin/auth/login')
            .send({ email: 'support2@traqora.io', password: 'pass' })
            .expect(200);
        await request(app)
            .get('/api/v1/admin/analytics')
            .set('Authorization', `Bearer ${loginRes.body.data.token}`)
            .expect(403);
        await repo.remove(support);
    });
});
