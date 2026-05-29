import { v4 as uuidv4 } from 'uuid';

// ─── User ────────────────────────────────────────────────────────────────────

export const createUser = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  email: `user-${uuidv4().slice(0, 8)}@example.com`,
  walletAddress: `GBZX${uuidv4().replace(/-/g, '').toUpperCase().slice(0, 52)}`,
  createdAt: new Date(),
  updatedAt: new Date(),
  loyaltyPoints: 0,
  ...overrides,
});

// ─── Flight ──────────────────────────────────────────────────────────────────

export const createFlight = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  flightNumber: `TQ${Math.floor(Math.random() * 9000 + 1000)}`,
  origin: 'LOS',
  destination: 'LHR',
  departureTime: new Date(Date.now() + 86_400_000), // tomorrow
  arrivalTime: new Date(Date.now() + 86_400_000 + 7 * 3600_000),
  price: 450.0,
  currency: 'USD',
  availableSeats: 120,
  airline: 'Traqora Air',
  ...overrides,
});

// ─── Booking ─────────────────────────────────────────────────────────────────

export const createBooking = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  userId: uuidv4(),
  flightId: uuidv4(),
  status: 'confirmed',
  totalAmount: 450.0,
  currency: 'USD',
  paymentMethod: 'stripe',
  stripePaymentIntentId: `pi_${uuidv4().replace(/-/g, '')}`,
  stellarTransactionHash: null,
  contractId: null,
  passengerName: 'John Doe',
  passengerEmail: 'john@example.com',
  seatNumber: '14A',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─── Refund ──────────────────────────────────────────────────────────────────

export const createRefund = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  bookingId: uuidv4(),
  userId: uuidv4(),
  amount: 450.0,
  currency: 'USD',
  status: 'pending',
  reason: 'Customer requested cancellation',
  stripeRefundId: null,
  stellarRefundHash: null,
  processedAt: null,
  createdAt: new Date(),
  ...overrides,
});

// ─── Dispute ─────────────────────────────────────────────────────────────────

export const createDispute = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  bookingId: uuidv4(),
  userId: uuidv4(),
  reason: 'Flight was cancelled without notice',
  status: 'open',
  evidence: [],
  resolution: null,
  resolvedAt: null,
  createdAt: new Date(),
  ...overrides,
});

// ─── Notification ────────────────────────────────────────────────────────────

export const createNotification = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  userId: uuidv4(),
  type: 'booking_confirmed',
  title: 'Booking Confirmed',
  message: 'Your flight booking has been confirmed.',
  read: false,
  metadata: {},
  createdAt: new Date(),
  ...overrides,
});

// ─── StellarTransaction ──────────────────────────────────────────────────────

export const createStellarTransaction = (overrides: Partial<any> = {}): any => ({
  hash: `${uuidv4().replace(/-/g, '').toUpperCase()}${uuidv4().replace(/-/g, '').toUpperCase()}`.slice(0, 64),
  ledger: Math.floor(Math.random() * 1_000_000 + 50_000_000),
  createdAt: new Date().toISOString(),
  sourceAccount: `GBZ${uuidv4().replace(/-/g, '').toUpperCase().slice(0, 53)}`,
  fee: '100',
  successful: true,
  ...overrides,
});

// ─── PriceAlert ──────────────────────────────────────────────────────────────

export const createPriceAlert = (overrides: Partial<any> = {}): any => ({
  id: uuidv4(),
  userId: uuidv4(),
  origin: 'LOS',
  destination: 'LHR',
  targetPrice: 350.0,
  currentPrice: 450.0,
  active: true,
  notifiedAt: null,
  createdAt: new Date(),
  ...overrides,
});
