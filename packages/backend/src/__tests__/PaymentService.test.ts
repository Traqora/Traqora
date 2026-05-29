import { PaymentService } from '../../src/services/PaymentService';
import {
  createMockStripe,
  createMockSorobanClient,
  createMockStellarServer,
  createMockRepository,
} from '../../../tests/helpers/mocks';
import { BookingBuilder } from '../../../tests/helpers/builders';
import { createBooking } from '../../../tests/helpers/factories';

describe('PaymentService', () => {
  let service: PaymentService;
  let stripe: ReturnType<typeof createMockStripe>;
  let soroban: ReturnType<typeof createMockSorobanClient>;
  let stellarServer: ReturnType<typeof createMockStellarServer>;
  let paymentRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    stripe = createMockStripe();
    soroban = createMockSorobanClient();
    stellarServer = createMockStellarServer();
    paymentRepo = createMockRepository();

    service = new PaymentService(
      stripe as any,
      soroban as any,
      stellarServer as any,
      paymentRepo as any,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ── createStripePaymentIntent ──────────────────────────────────────────────

  describe('createStripePaymentIntent()', () => {
    it('creates a Stripe payment intent with correct amount', async () => {
      const booking = new BookingBuilder().withAmount(450).build();

      const result = await service.createStripePaymentIntent(booking);

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 45000, // cents
          currency: 'usd',
          metadata: expect.objectContaining({ bookingId: booking.id }),
        }),
      );
      expect(result.client_secret).toBeDefined();
    });

    it('converts non-USD currency correctly', async () => {
      const booking = new BookingBuilder().withAmount(100, 'EUR').build();

      await service.createStripePaymentIntent(booking);

      expect(stripe.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'eur', amount: 10000 }),
      );
    });

    it('throws if Stripe returns an error', async () => {
      stripe.paymentIntents.create.mockRejectedValue(new Error('card_declined'));

      const booking = new BookingBuilder().withAmount(100).build();

      await expect(service.createStripePaymentIntent(booking)).rejects.toThrow('card_declined');
    });
  });

  // ── verifyStripePayment ────────────────────────────────────────────────────

  describe('verifyStripePayment()', () => {
    it('returns true for succeeded payment intent', async () => {
      stripe.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded', id: 'pi_ok' });

      const result = await service.verifyStripePayment('pi_ok');
      expect(result).toBe(true);
    });

    it('returns false for non-succeeded status', async () => {
      stripe.paymentIntents.retrieve.mockResolvedValue({ status: 'requires_action', id: 'pi_fail' });

      const result = await service.verifyStripePayment('pi_fail');
      expect(result).toBe(false);
    });

    it('throws if payment intent is not found', async () => {
      stripe.paymentIntents.retrieve.mockRejectedValue({ code: 'resource_missing' });

      await expect(service.verifyStripePayment('pi_missing')).rejects.toMatchObject({
        code: 'resource_missing',
      });
    });
  });

  // ── processStripeRefund ────────────────────────────────────────────────────

  describe('processStripeRefund()', () => {
    it('issues a Stripe refund for the full booking amount', async () => {
      const booking = new BookingBuilder().confirmed().withStripePayment('pi_full_refund').withAmount(300).build();

      stripe.refunds.create.mockResolvedValue({ id: 're_001', status: 'succeeded', amount: 30000 });

      const result = await service.processStripeRefund(booking);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ payment_intent: 'pi_full_refund', amount: 30000 }),
      );
      expect(result.status).toBe('succeeded');
    });

    it('supports partial refunds', async () => {
      const booking = new BookingBuilder().confirmed().withStripePayment('pi_partial').withAmount(300).build();

      stripe.refunds.create.mockResolvedValue({ id: 're_partial', status: 'succeeded', amount: 15000 });

      const result = await service.processStripeRefund(booking, 150);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 15000 }),
      );
      expect(result.amount).toBe(15000);
    });
  });

  // ── initiateStellarPayment ─────────────────────────────────────────────────

  describe('initiateStellarPayment()', () => {
    it('builds and submits a Stellar transaction', async () => {
      const booking = new BookingBuilder().pending().withAmount(100).build();
      const senderWallet = 'GBZX_SENDER_WALLET';

      stellarServer.loadAccount.mockResolvedValue({
        accountId: () => senderWallet,
        sequenceNumber: () => '100',
        incrementSequenceNumber: jest.fn(),
        balances: [{ asset_type: 'native', balance: '500.0000000' }],
      });

      const result = await service.initiateStellarPayment(booking, senderWallet);

      expect(stellarServer.submitTransaction).toHaveBeenCalledTimes(1);
      expect(result.hash).toBeDefined();
      expect(result.successful).toBe(true);
    });

    it('throws if sender has insufficient balance', async () => {
      const booking = new BookingBuilder().pending().withAmount(100).build();

      stellarServer.loadAccount.mockResolvedValue({
        accountId: () => 'GBZ_POOR',
        sequenceNumber: () => '100',
        incrementSequenceNumber: jest.fn(),
        balances: [{ asset_type: 'native', balance: '0.5000000' }],
      });

      await expect(service.initiateStellarPayment(booking, 'GBZ_POOR')).rejects.toThrow(
        /insufficient balance/i,
      );
    });

    it('throws if Stellar network rejects the transaction', async () => {
      const booking = new BookingBuilder().pending().withAmount(50).build();

      stellarServer.loadAccount.mockResolvedValue({
        accountId: () => 'GBZ_VALID',
        sequenceNumber: () => '100',
        incrementSequenceNumber: jest.fn(),
        balances: [{ asset_type: 'native', balance: '999.0000000' }],
      });
      stellarServer.submitTransaction.mockRejectedValue({ response: { data: { status: 400, extras: { result_codes: { transaction: 'tx_bad_seq' } } } } });

      await expect(service.initiateStellarPayment(booking, 'GBZ_VALID')).rejects.toThrow(/tx_bad_seq/i);
    });
  });

  // ── verifyStellarTransaction ───────────────────────────────────────────────

  describe('verifyStellarTransaction()', () => {
    it('returns true when transaction is successful on chain', async () => {
      stellarServer.call.mockResolvedValue({
        records: [{ hash: 'STELLAR_HASH_001', successful: true }],
      });

      const result = await service.verifyStellarTransaction('STELLAR_HASH_001');
      expect(result).toBe(true);
    });

    it('returns false when transaction is not found', async () => {
      stellarServer.call.mockResolvedValue({ records: [] });

      const result = await service.verifyStellarTransaction('STELLAR_HASH_MISSING');
      expect(result).toBe(false);
    });
  });

  // ── handleStripeWebhook ────────────────────────────────────────────────────

  describe('handleStripeWebhook()', () => {
    it('processes payment_intent.succeeded event', async () => {
      const payload = Buffer.from('{}');
      const sig = 'stripe_sig';

      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_webhook_test', status: 'succeeded', metadata: { bookingId: 'b-001' } } },
      });

      const result = await service.handleStripeWebhook(payload, sig);

      expect(result.processed).toBe(true);
      expect(result.bookingId).toBe('b-001');
    });

    it('ignores unhandled event types gracefully', async () => {
      stripe.webhooks.constructEvent.mockReturnValue({
        type: 'customer.created',
        data: { object: {} },
      });

      const result = await service.handleStripeWebhook(Buffer.from('{}'), 'sig');
      expect(result.processed).toBe(false);
    });

    it('throws on invalid webhook signature', async () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook signature verification failed');
      });

      await expect(
        service.handleStripeWebhook(Buffer.from('bad_payload'), 'bad_sig'),
      ).rejects.toThrow(/signature verification failed/i);
    });
  });
});
