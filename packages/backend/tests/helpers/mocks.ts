/**
 * Shared mock factories for external services.
 * Import these in individual test files to avoid repetition.
 */

// ─── Stripe Mocks ────────────────────────────────────────────────────────────

export const createMockStripe = () => ({
  paymentIntents: {
    create: jest.fn().mockResolvedValue({
      id: 'pi_test_mock',
      status: 'requires_payment_method',
      client_secret: 'pi_test_mock_secret',
      amount: 45000,
      currency: 'usd',
    }),
    confirm: jest.fn().mockResolvedValue({
      id: 'pi_test_mock',
      status: 'succeeded',
    }),
    retrieve: jest.fn().mockResolvedValue({
      id: 'pi_test_mock',
      status: 'succeeded',
      amount: 45000,
    }),
    cancel: jest.fn().mockResolvedValue({ id: 'pi_test_mock', status: 'canceled' }),
  },
  refunds: {
    create: jest.fn().mockResolvedValue({
      id: 're_test_mock',
      status: 'succeeded',
      amount: 45000,
    }),
  },
  webhooks: {
    constructEvent: jest.fn().mockReturnValue({
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_test_mock', status: 'succeeded' } },
    }),
  },
});

// ─── Stellar / StellarSDK Mocks ──────────────────────────────────────────────

export const createMockStellarServer = () => ({
  loadAccount: jest.fn().mockResolvedValue({
    accountId: () => 'GBZ_TEST_ACCOUNT',
    sequenceNumber: () => '100',
    incrementSequenceNumber: jest.fn(),
    balances: [{ asset_type: 'native', balance: '1000.0000000' }],
  }),
  submitTransaction: jest.fn().mockResolvedValue({
    hash: 'STELLAR_TX_HASH_MOCK_1234567890ABCDEF',
    ledger: 12345678,
    successful: true,
  }),
  transactions: jest.fn().mockReturnThis(),
  forAccount: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  call: jest.fn().mockResolvedValue({
    records: [
      {
        hash: 'STELLAR_TX_HASH_MOCK',
        ledger_attr: 12345678,
        created_at: new Date().toISOString(),
        successful: true,
      },
    ],
  }),
});

export const createMockStellarKeypair = (publicKey = 'GBZT_MOCK_PUBLIC_KEY') => ({
  publicKey: jest.fn().mockReturnValue(publicKey),
  secret: jest.fn().mockReturnValue('STEST_MOCK_SECRET'),
  sign: jest.fn().mockReturnValue(Buffer.from('mock_signature')),
});

// ─── Soroban Contract Mocks ──────────────────────────────────────────────────

export const createMockSorobanClient = () => ({
  simulateTransaction: jest.fn().mockResolvedValue({
    result: { retval: { type: 'bool', val: true } },
    cost: { cpuInsns: '1000', memBytes: '500' },
  }),
  sendTransaction: jest.fn().mockResolvedValue({
    hash: 'SOROBAN_TX_HASH_MOCK',
    status: 'PENDING',
  }),
  getTransaction: jest.fn().mockResolvedValue({
    status: 'SUCCESS',
    returnValue: { type: 'bool', val: true },
  }),
  getContractData: jest.fn().mockResolvedValue({
    val: { type: 'map', val: [] },
  }),
});

// ─── Redis Mocks ─────────────────────────────────────────────────────────────

export const createMockRedisClient = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(0),
  expire: jest.fn().mockResolvedValue(1),
  hget: jest.fn().mockResolvedValue(null),
  hset: jest.fn().mockResolvedValue(1),
  hgetall: jest.fn().mockResolvedValue({}),
  sadd: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
  srem: jest.fn().mockResolvedValue(1),
  publish: jest.fn().mockResolvedValue(1),
  subscribe: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue('OK'),
});

// ─── TypeORM Repository Mock ─────────────────────────────────────────────────

export const createMockRepository = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  findOneBy: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockImplementation((entity: any) => Promise.resolve({ ...entity })),
  create: jest.fn().mockImplementation((dto: any) => dto),
  update: jest.fn().mockResolvedValue({ affected: 1 }),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
  count: jest.fn().mockResolvedValue(0),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  createQueryBuilder: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(null),
  getMany: jest.fn().mockResolvedValue([]),
  getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
});

// ─── Email / Notification Mocks ──────────────────────────────────────────────

export const createMockEmailService = () => ({
  sendBookingConfirmation: jest.fn().mockResolvedValue(true),
  sendRefundConfirmation: jest.fn().mockResolvedValue(true),
  sendPriceAlert: jest.fn().mockResolvedValue(true),
  sendDisputeUpdate: jest.fn().mockResolvedValue(true),
  sendWelcomeEmail: jest.fn().mockResolvedValue(true),
});

// ─── WebSocket Mock ──────────────────────────────────────────────────────────

export const createMockWebSocketServer = () => ({
  clients: new Set(),
  emit: jest.fn(),
  on: jest.fn(),
  close: jest.fn(),
  handleUpgrade: jest.fn(),
  broadcast: jest.fn(),
});

export const createMockWebSocketClient = () => ({
  send: jest.fn(),
  close: jest.fn(),
  on: jest.fn(),
  readyState: 1, // WebSocket.OPEN
  ping: jest.fn(),
});
