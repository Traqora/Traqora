import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';
import { Passenger } from '../src/db/entities/Passenger';
import { Booking, BookingStatus } from '../src/db/entities/Booking';
import { SearchHistoryEntry } from '../src/db/entities/SearchHistoryEntry';

const KEY = { 'X-Admin-Api-Key': 'dev-admin-key' };

describe('GET /api/v1/admin/analytics/funnel', () => {
    beforeAll(async () => {
        process.env.NODE_ENV = 'test';
        await initDataSource();

        const searchRepo = AppDataSource.getRepository(SearchHistoryEntry);
        await searchRepo.save(
            Array.from({ length: 4 }, () =>
                searchRepo.create({
                    userId: 'GFUNNELUSER',
                    fromAirport: 'LOS',
                    toAirport: 'ACC',
                    departureDate: '2026-12-01',
                    passengers: 1,
                    cabinClass: 'economy',
                }),
            ),
        );

        const flight = await AppDataSource.getRepository(Flight).save(
            AppDataSource.getRepository(Flight).create({
                flightNumber: 'TQ-FUN1',
                fromAirport: 'LOS',
                toAirport: 'ACC',
                departureTime: new Date(Date.now() + 86400 * 1000),
                seatsAvailable: 10,
                priceCents: 30000,
                airlineSorobanAddress: 'GAFUNNEL',
            }),
        );
        const passenger = await AppDataSource.getRepository(Passenger).save(
            AppDataSource.getRepository(Passenger).create({
                email: 'funnel-user@example.com',
                firstName: 'Fun',
                lastName: 'Nel',
                sorobanAddress: 'GFUNNELUSER',
            }),
        );

        const bookingRepo = AppDataSource.getRepository(Booking);
        const statuses: BookingStatus[] = ['awaiting_payment', 'confirmed'];
        await bookingRepo.save(
            statuses.map((status, i) =>
                bookingRepo.create({ flight, passenger, status, amountCents: 30000, idempotencyKey: `funnel-idem-${i}` }),
            ),
        );
    });

    afterAll(async () => {
        if (AppDataSource.isInitialized) await AppDataSource.destroy();
    });

    it('returns search → book → pay stages for the default window', async () => {
        const res = await request(app).get('/api/v1/admin/analytics/funnel').set(KEY).expect(200);

        expect(res.body.success).toBe(true);
        const { stages, overallConversionRate, window } = res.body.data;
        expect(stages.map((s: { key: string }) => s.key)).toEqual(['search', 'book', 'pay']);

        const [search, book, pay] = stages;
        expect(search.count).toBeGreaterThanOrEqual(4);
        expect(book.count).toBeGreaterThanOrEqual(2);
        expect(pay.count).toBeGreaterThanOrEqual(1);
        expect(pay.count).toBeLessThan(book.count);
        expect(typeof overallConversionRate).toBe('number');
        expect(new Date(window.from).getTime()).toBeLessThan(new Date(window.to).getTime());
    });

    it('returns zero counts and null rates for a window with no activity', async () => {
        const res = await request(app)
            .get('/api/v1/admin/analytics/funnel')
            .query({ from: '2000-01-01T00:00:00Z', to: '2000-01-02T00:00:00Z' })
            .set(KEY)
            .expect(200);

        expect(res.body.data.stages.map((s: { count: number }) => s.count)).toEqual([0, 0, 0]);
        expect(res.body.data.overallConversionRate).toBeNull();
    });

    it('rejects a window where from is after to', async () => {
        await request(app)
            .get('/api/v1/admin/analytics/funnel')
            .query({ from: '2026-09-10T00:00:00Z', to: '2026-09-01T00:00:00Z' })
            .set(KEY)
            .expect(400);
    });

    it('rejects an unparseable date', async () => {
        await request(app).get('/api/v1/admin/analytics/funnel').query({ from: 'not-a-date' }).set(KEY).expect(400);
    });

    it('requires admin credentials', async () => {
        await request(app).get('/api/v1/admin/analytics/funnel').expect(401);
    });
});
