import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Passenger } from '../src/db/entities/Passenger';
import { Booking } from '../src/db/entities/Booking';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

describe('Admin Refunds', () => {
    let confirmedBookingId: string;
    let failedBookingId: string;
    let paidBookingId: string;

    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();

        const flightRepo = AppDataSource.getRepository(Flight);
        const passengerRepo = AppDataSource.getRepository(Passenger);
        const bookingRepo = AppDataSource.getRepository(Booking);

        const flight = await flightRepo.save(
            flightRepo.create({
                flightNumber: 'TQ-D01',
                fromAirport: 'KAN',
                toAirport: 'FRA',
                departureTime: new Date(Date.now() + 86400 * 1000),
                seatsAvailable: 20,
                priceCents: 30000,
                airlineSorobanAddress: 'GAREFUND',
            })
        );
        const passenger = await passengerRepo.save(
            passengerRepo.create({
                email: 'refund-user@example.com',
                firstName: 'Ref',
                lastName: 'Und',
                sorobanAddress: 'GREFUND',
            })
        );

        const confirmed = await bookingRepo.save(
            bookingRepo.create({ flight, passenger, status: 'confirmed', amountCents: 30000, idempotencyKey: 'refund-idem-1' })
        );
        confirmedBookingId = confirmed.id;

        const failed = await bookingRepo.save(
            bookingRepo.create({ flight, passenger, status: 'failed', amountCents: 30000, idempotencyKey: 'refund-idem-2' })
        );
        failedBookingId = failed.id;

        const paid = await bookingRepo.save(
            bookingRepo.create({ flight, passenger, status: 'paid', amountCents: 30000, idempotencyKey: 'refund-idem-3' })
        );
        paidBookingId = paid.id;
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('GET /api/v1/admin/refunds returns only confirmed/failed bookings', async () => {
        const res = await request(app).get('/api/v1/admin/refunds').set(KEY).expect(200);
        expect(res.body.success).toBe(true);
        const statuses = res.body.data.bookings.map((b: any) => b.status);
        expect(statuses).not.toContain('paid');
        statuses.forEach((s: string) => expect(['confirmed', 'failed']).toContain(s));
    });

    it('POST /api/v1/admin/refunds/:id/approve marks booking as refunded', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/refunds/${confirmedBookingId}/approve`)
            .set(KEY)
            .expect(200);
        expect(res.body.data.status).toBe('refunded');
    });

    it('POST /api/v1/admin/refunds/:id/approve returns 409 on non-eligible status', async () => {
        // paidBookingId has status 'paid', not in refundable set
        await request(app)
            .post(`/api/v1/admin/refunds/${paidBookingId}/approve`)
            .set(KEY)
            .expect(409);
    });

    it('POST /api/v1/admin/refunds/:id/reject marks booking as refund_rejected', async () => {
        const res = await request(app)
            .post(`/api/v1/admin/refunds/${failedBookingId}/reject`)
            .set(KEY)
            .send({ reason: 'Fraud detected' })
            .expect(200);
        expect(res.body.data.status).toBe('refund_rejected');
        expect(res.body.data.lastError).toBe('Fraud detected');
    });

    it('POST /api/v1/admin/refunds/:id/reject returns 400 without reason', async () => {
        await request(app)
            .post(`/api/v1/admin/refunds/${failedBookingId}/reject`)
            .set(KEY)
            .send({})
            .expect(400);
    });

    it('POST /api/v1/admin/refunds/:id/approve returns 404 for unknown id', async () => {
        await request(app)
            .post('/api/v1/admin/refunds/00000000-0000-0000-0000-000000000000/approve')
            .set(KEY)
            .expect(404);
    });
});
