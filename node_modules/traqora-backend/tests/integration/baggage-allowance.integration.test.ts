import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app';
import { AppDataSource, initDataSource } from '../../src/db/dataSource';
import { config } from '../../src/config';
import { Flight } from '../../src/db/entities/Flight';
import { Passenger } from '../../src/db/entities/Passenger';
import { Booking } from '../../src/db/entities/Booking';

const WALLET = 'GBAGGAGEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const token = jwt.sign({ walletAddress: WALLET, walletType: 'freighter' }, config.jwtSecret, {
  expiresIn: '1h',
});

describe('baggage allowance calculation (issue #387)', () => {
  let app: import('express').Express;
  let bookingId: string;
  let baBookingId: string;

  beforeAll(async () => {
    await initDataSource();
    app = await createApp({ globalRateLimit: false, tieredRateLimit: false });

    const flightRepo = AppDataSource.getRepository(Flight);
    const passengerRepo = AppDataSource.getRepository(Passenger);
    const bookingRepo = AppDataSource.getRepository(Booking);

    const genericFlight = await flightRepo.save(
      flightRepo.create({
        flightNumber: 'TQ-100',
        airlineCode: 'TQ',
        fromAirport: 'JFK',
        toAirport: 'LHR',
        departureTime: new Date(Date.now() + 86_400_000),
        seatsAvailable: 100,
        priceCents: 50000,
        airlineSorobanAddress: 'GAAIRLINE',
      }),
    );

    const baFlight = await flightRepo.save(
      flightRepo.create({
        flightNumber: 'BA-200',
        airlineCode: 'BA',
        fromAirport: 'LHR',
        toAirport: 'JFK',
        departureTime: new Date(Date.now() + 86_400_000),
        seatsAvailable: 100,
        priceCents: 60000,
        airlineSorobanAddress: 'GAAIRLINE2',
      }),
    );

    const passenger = await passengerRepo.save(
      passengerRepo.create({
        email: 'traveler@example.com',
        firstName: 'Ada',
        lastName: 'Explorer',
      }),
    );

    const booking = await bookingRepo.save(
      bookingRepo.create({ flight: genericFlight, passenger, amountCents: 50000, status: 'confirmed' }),
    );
    bookingId = booking.id;

    const baBooking = await bookingRepo.save(
      bookingRepo.create({ flight: baFlight, passenger, amountCents: 60000, status: 'confirmed' }),
    );
    baBookingId = baBooking.id;
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get(`/api/v1/bookings/${bookingId}/baggage-allowance`);
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown booking', async () => {
    const res = await request(app)
      .get('/api/v1/bookings/00000000-0000-0000-0000-000000000000/baggage-allowance')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('defaults to the economy allowance when no class is specified', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/baggage-allowance`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.cabinClass).toBe('economy');
    expect(res.body.data.allowance).toEqual({
      checkedBags: 1,
      checkedWeightKgPerBag: 23,
      carryOnBags: 1,
      carryOnWeightKg: 7,
      currency: 'USD',
    });
    expect(res.body.data.restrictions.length).toBeGreaterThan(0);
  });

  it('returns a richer allowance for business class', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/baggage-allowance?class=business`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.allowance.checkedBags).toBe(2);
    expect(res.body.data.allowance.checkedWeightKgPerBag).toBe(32);
  });

  it('applies an airline-specific override', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${baBookingId}/baggage-allowance`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // BA override caps economy checked bags at 1 (vs the 1-bag default here too,
    // but with the override's explicit weight limit)
    expect(res.body.data.allowance.checkedBags).toBe(1);
    expect(res.body.data.allowance.checkedWeightKgPerBag).toBe(23);
  });

  it('returns 400 for an invalid cabin class', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/baggage-allowance?class=super-first`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('calculates excess fees when bags and weight are supplied', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/baggage-allowance?bags=2&heaviestBagKg=28`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.excessBags).toBe(1); // 2 bags vs 1 allowed
    expect(res.body.data.excessWeightKg).toBe(5); // 28kg vs 23kg limit
    expect(res.body.data.feeCents).toBe(6000 + 5 * 1500); // 1 excess bag + 5kg excess
  });

  it('returns zero excess fee when within allowance', async () => {
    const res = await request(app)
      .get(`/api/v1/bookings/${bookingId}/baggage-allowance?bags=1&heaviestBagKg=20`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.excessBags).toBe(0);
    expect(res.body.data.excessWeightKg).toBe(0);
    expect(res.body.data.feeCents).toBe(0);
  });
});
