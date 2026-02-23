import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/errorHandler';
import { initDataSource, AppDataSource } from '../../db/dataSource';
import { Flight } from '../../db/entities/Flight';
import { Passenger } from '../../db/entities/Passenger';
import { Booking } from '../../db/entities/Booking';
import { IdempotencyKey } from '../../db/entities/IdempotencyKey';
import { getOrCreateIdempotencyKey, hashObject } from '../../services/idempotency';
import { stripe, stripeWebhookSecret } from '../../services/stripe';
import { buildCreateBookingUnsignedXdr, submitSignedSorobanXdr, getTransactionStatus } from '../../services/soroban';
import { withRetries } from '../../services/retry';
import { config } from '../../config';

const router = Router();

const passengerSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(4).optional(),
  sorobanAddress: z.string().min(1),
});

const createBookingSchema = z.object({
  flightId: z.string().uuid(),
  passenger: passengerSchema,
});

router.post('/', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  const parsed = createBookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: { message: 'Validation error', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
    });
  }

  const idempotencyKeyHeader = req.header('Idempotency-Key');
  if (!idempotencyKeyHeader) {
    return res.status(400).json({
      success: false,
      error: { message: 'Missing Idempotency-Key header', code: 'IDEMPOTENCY_KEY_REQUIRED' },
    });
  }

  const requestHash = hashObject(parsed.data);

  const bookingRepo = AppDataSource.getRepository(Booking);
  const flightRepo = AppDataSource.getRepository(Flight);
  const passengerRepo = AppDataSource.getRepository(Passenger);
  const idempotencyRepo = AppDataSource.getRepository(IdempotencyKey);

  const idem = await getOrCreateIdempotencyKey({
    key: idempotencyKeyHeader,
    method: req.method,
    path: req.baseUrl + req.path,
    requestHash,
  });

  if (idem.requestHash !== requestHash) {
    return res.status(409).json({
      success: false,
      error: { message: 'Idempotency key reuse with different payload', code: 'IDEMPOTENCY_CONFLICT' },
    });
  }

  if (idem.resourceId) {
    const existing = await bookingRepo.findOne({ where: { id: idem.resourceId } });
    if (existing) {
      return res.status(200).json({ success: true, data: existing, idempotent: true });
    }
  }

  const flight = await flightRepo.findOne({ where: { id: parsed.data.flightId } });
  if (!flight) {
    return res.status(404).json({ success: false, error: { message: 'Flight not found', code: 'FLIGHT_NOT_FOUND' } });
  }

  if (flight.seatsAvailable <= 0) {
    return res.status(409).json({ success: false, error: { message: 'Flight sold out', code: 'FLIGHT_SOLD_OUT' } });
  }

  // Reserve a seat (best-effort optimistic update)
  const updated = await flightRepo
    .createQueryBuilder()
    .update(Flight)
    .set({ seatsAvailable: () => 'seatsAvailable - 1' })
    .where('id = :id', { id: flight.id })
    .andWhere('seatsAvailable > 0')
    .execute();

  if (!updated.affected) {
    return res.status(409).json({ success: false, error: { message: 'Flight sold out', code: 'FLIGHT_SOLD_OUT' } });
  }

  const passenger = passengerRepo.create(parsed.data.passenger);

  const amountCents = flight.priceCents;

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'usd',
    metadata: {
      flightId: flight.id,
    },
  });

  const unsigned = await buildCreateBookingUnsignedXdr({
    passenger: passenger.sorobanAddress,
    airline: flight.airlineSorobanAddress,
    flightNumber: flight.flightNumber,
    fromAirport: flight.fromAirport,
    toAirport: flight.toAirport,
    departureTime: Math.floor(flight.departureTime.getTime() / 1000),
    price: BigInt(amountCents),
    token: config.contracts.token,
  });

  const booking = bookingRepo.create({
    idempotencyKey: idempotencyKeyHeader,
    flight,
    passenger,
    status: 'awaiting_payment',
    amountCents,
    stripePaymentIntentId: paymentIntent.id,
    stripeClientSecret: paymentIntent.client_secret,
    sorobanUnsignedXdr: unsigned.xdr,
  });

  const saved = await bookingRepo.save(booking);
  idem.resourceId = saved.id;
  await idempotencyRepo.save(idem);

  res.status(201).json({
    success: true,
    data: saved,
    payment: { paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret },
    soroban: { unsignedXdr: unsigned.xdr },
  });
}));

router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
  if (!booking) {
    return res.status(404).json({ success: false, error: { message: 'Booking not found', code: 'BOOKING_NOT_FOUND' } });
  }
  res.json({ success: true, data: booking });
}));

router.post('/:id/submit-onchain', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();
  const schema = z.object({ signedXdr: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: { message: 'Validation error', code: 'VALIDATION_ERROR' } });
  }

  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
  if (!booking) {
    return res.status(404).json({ success: false, error: { message: 'Booking not found', code: 'BOOKING_NOT_FOUND' } });
  }

  if (booking.status !== 'paid' && booking.status !== 'onchain_pending') {
    return res.status(409).json({
      success: false,
      error: { message: 'Booking not ready for on-chain submission', code: 'BOOKING_NOT_READY' },
    });
  }

  booking.status = 'onchain_pending';
  await bookingRepo.save(booking);

  const result = await withRetries(
    async () => {
      const r = await submitSignedSorobanXdr(parsed.data.signedXdr);
      return r;
    },
    { retries: 3, baseDelayMs: 300 }
  );

  booking.sorobanTxHash = result.txHash;
  booking.status = 'onchain_submitted';
  booking.contractSubmitAttempts = (booking.contractSubmitAttempts || 0) + 1;
  await bookingRepo.save(booking);

  res.status(202).json({ success: true, data: booking, soroban: result });
}));

router.post('/webhook/stripe', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();

  const sig = req.headers['stripe-signature'];
  if (!stripeWebhookSecret) {
    return res.status(500).json({ success: false, error: { message: 'Stripe webhook secret not configured', code: 'CONFIG_ERROR' } });
  }
  if (!sig || typeof sig !== 'string') {
    return res.status(400).json({ success: false, error: { message: 'Missing stripe-signature header', code: 'SIGNATURE_REQUIRED' } });
  }

  let event;
  try {
    // req.body is a Buffer because express.raw() is mounted for this route.
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, stripeWebhookSecret);
  } catch (err: any) {
    return res.status(400).json({ success: false, error: { message: err.message || 'Invalid signature', code: 'INVALID_SIGNATURE' } });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as any;
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({ where: { stripePaymentIntentId: intent.id } });
    if (booking) {
      booking.status = 'paid';
      await bookingRepo.save(booking);
    }
  }

  res.json({ received: true });
}));

router.get('/:id/transaction-status', asyncHandler(async (req: Request, res: Response) => {
  await initDataSource();
  const bookingRepo = AppDataSource.getRepository(Booking);
  const booking = await bookingRepo.findOne({ where: { id: req.params.id } });
  
  if (!booking) {
    return res.status(404).json({ success: false, error: { message: 'Booking not found', code: 'BOOKING_NOT_FOUND' } });
  }

  if (!booking.sorobanTxHash) {
    return res.json({
      success: true,
      data: {
        bookingStatus: booking.status,
        transactionStatus: null,
      },
    });
  }

  const txStatus = await getTransactionStatus(booking.sorobanTxHash);

  if (txStatus.status === 'success' && booking.status !== 'confirmed') {
    booking.status = 'confirmed';
    if (txStatus.result) {
      booking.sorobanBookingId = txStatus.result.bookingId || null;
    }
    await bookingRepo.save(booking);
  } else if (txStatus.status === 'failed' && booking.status !== 'failed') {
    booking.status = 'failed';
    booking.lastError = txStatus.error || 'Transaction failed';
    await bookingRepo.save(booking);
  }

  res.json({
    success: true,
    data: {
      bookingStatus: booking.status,
      transactionStatus: txStatus,
    },
  });
}));

export const bookingRoutes = router;
