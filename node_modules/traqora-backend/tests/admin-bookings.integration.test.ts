import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Passenger } from '../src/db/entities/Passenger';
import { Booking } from '../src/db/entities/Booking';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

describe('Admin Bookings Oversight', () => {
    let bookingId: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();

        const flightRepo = AppDataSource.getRepository(Flight);
        const passengerRepo = AppDataSource.getRepository(Passenger);
        const bookingRepo = AppDataSource.getRepository(Booking);

        const flight = await flightRepo.save(
            flightRepo.create({
                flightNumber: 'TQ-B01',
                fromAirport: 'ABV',
                toAirport: 'LOS',
                departureTime: new Date(Date.now() + 86400 * 1000),
                seatsAvailable: 10,
                priceCents: 15000,
                airlineSorobanAddress: 'GAAIRLINEADMIN',
            })
        );

        const passenger = await passengerRepo.save(
            passengerRepo.create({
                email: 'booking-user@example.com',
                firstName: 'Booking',
                lastName: 'User',
                sorobanAddress: 'GBOOKING',
            })
        );

        const booking = await bookingRepo.save(
            bookingRepo.create({
                flight,
                passenger,
                status: 'paid',
                amountCents: 15000,
                idempotencyKey: 'admin-test-idem-1',
            })
        );
        bookingId = booking.id;
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('GET /api/v1/admin/bookings lists bookings', async () => {
        const res = await request(app).get('/api/v1/admin/bookings').set(KEY).expect(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data.bookings)).toBe(true);
        expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /api/v1/admin/bookings supports status filter', async () => {
        const res = await request(app)
            .get('/api/v1/admin/bookings?status=paid')
            .set(KEY)
            .expect(200);
        expect(res.body.data.bookings.every((b: any) => b.status === 'paid')).toBe(true);
    });

    it('GET /api/v1/admin/bookings/:id returns booking with relations', async () => {
        const res = await request(app).get(`/api/v1/admin/bookings/${bookingId}`).set(KEY).expect(200);
        expect(res.body.data.id).toBe(bookingId);
        expect(res.body.data.flight).toBeDefined();
        expect(res.body.data.passenger).toBeDefined();
    });

    it('GET /api/v1/admin/bookings/:id returns 404 for unknown id', async () => {
        await request(app)
            .get('/api/v1/admin/bookings/00000000-0000-0000-0000-000000000000')
            .set(KEY)
            .expect(404);
    });

    it('PATCH /api/v1/admin/bookings/:id/status overrides booking status', async () => {
        const res = await request(app)
            .patch(`/api/v1/admin/bookings/${bookingId}/status`)
            .set(KEY)
            .send({ status: 'confirmed' })
            .expect(200);
        expect(res.body.data.status).toBe('confirmed');
    });

    it('PATCH /api/v1/admin/bookings/:id/status rejects invalid status (400)', async () => {
        await request(app)
            .patch(`/api/v1/admin/bookings/${bookingId}/status`)
            .set(KEY)
            .send({ status: 'not_a_valid_status' })
            .expect(400);
    });
});
