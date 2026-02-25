import request from 'supertest';
import app from '../src/index';
import { AppDataSource, initDataSource } from '../src/db/dataSource';
import { Flight } from '../src/db/entities/Flight';

jest.mock('../src/services/stripe', () => {
  let callCount = 0;
  const paymentIntents = {
    create: jest.fn(async () => {
      callCount++;
      return { id: `pi_test_${callCount}`, client_secret: `cs_test_${callCount}` };
    }),
  };

  return {
    stripe: {
      paymentIntents,
      webhooks: {
        constructEvent: jest.fn((body: any) => {
          // In tests we just accept the event payload as-is
          return JSON.parse(body.toString('utf8'));
        }),
      },
    },
    stripeWebhookSecret: 'whsec_test',
  };
});

jest.mock('../src/services/soroban', () => {
  return {
    buildCreateBookingUnsignedXdr: jest.fn(async () => ({ xdr: 'unsigned_xdr_test' })),
    submitSignedSorobanXdr: jest.fn(async () => ({ txHash: 'txhash_test' })),
  };
});

describe('Booking flow', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    await initDataSource();

    const flightRepo = AppDataSource.getRepository(Flight);
    await flightRepo.save(
      flightRepo.create({
        flightNumber: 'TQ100',
        fromAirport: 'FRA',
        toAirport: 'LHR',
        departureTime: new Date(Date.now() + 86400 * 1000),
        seatsAvailable: 2,
        priceCents: 12345,
        airlineSorobanAddress: 'GAAIRLINE',
      })
    );
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  });

  it('creates booking with idempotency, returns stripe intent and unsigned xdr', async () => {
    const flight = await AppDataSource.getRepository(Flight).findOne({ where: { flightNumber: 'TQ100' } });
    expect(flight).toBeTruthy();

    const body = {
      flightId: flight!.id,
      passenger: {
        email: 'a@example.com',
        firstName: 'A',
        lastName: 'B',
        sorobanAddress: 'GPASSENGER',
      },
    };

    const res1 = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'idem-1')
      .send(body)
      .expect(201);

    expect(res1.body.success).toBe(true);
    expect(res1.body.payment.paymentIntentId).toBeTruthy();
    expect(res1.body.soroban.unsignedXdr).toBe('unsigned_xdr_test');

    const res2 = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'idem-1')
      .send(body)
      .expect(200);

    expect(res2.body.idempotent).toBe(true);
    expect(res2.body.data.id).toBe(res1.body.data.id);
  });

  it('marks booking paid via stripe webhook and allows on-chain submission with retry', async () => {
    const flight = await AppDataSource.getRepository(Flight).findOne({ where: { flightNumber: 'TQ100' } });

    const createRes = await request(app)
      .post('/api/v1/bookings')
      .set('Idempotency-Key', 'idem-2')
      .send({
        flightId: flight!.id,
        passenger: {
          email: 'c@example.com',
          firstName: 'C',
          lastName: 'D',
          sorobanAddress: 'GPASSENGER2',
        },
      })
      .expect(201);

    const bookingId = createRes.body.data.id;
    const stripePaymentIntentId = createRes.body.payment.paymentIntentId;

    await request(app)
      .post('/api/v1/bookings/webhook/stripe')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send(
        Buffer.from(
          JSON.stringify({
            type: 'payment_intent.succeeded',
            data: { object: { id: stripePaymentIntentId } },
          })
        )
      )
      .expect(200);

    const afterWebhook = await request(app).get(`/api/v1/bookings/${bookingId}`).expect(200);
    expect(afterWebhook.body.data.status).toBe('paid');

    const submitRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/submit-onchain`)
      .send({ signedXdr: 'signed_xdr_test' })
      .expect(202);

    expect(submitRes.body.data.status).toBe('onchain_submitted');
    expect(submitRes.body.data.sorobanTxHash).toBe('txhash_test');
  });
});
