import { BookingOrchestrationService } from '../src/services/bookingOrchestrationService';
import { ConflictError } from '../src/utils/errors';

jest.mock('../src/db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
  },
}));

jest.mock('../src/services/soroban', () => ({
  signAndSubmitCreateBooking: jest.fn(),
  getTransactionStatus: jest.fn(),
}));

jest.mock('../src/config', () => ({
  config: {
    contracts: {
      token: 'TEST_TOKEN',
    },
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('../src/websockets/server', () => ({
  getWebSocketServer: jest.fn(() => ({
    broadcastBookingStatus: jest.fn(),
  })),
}));

jest.mock('../src/services/idempotency', () => ({
  executeIdempotentOperation: jest.fn(),
  hashObject: jest.fn((obj: any) => JSON.stringify(obj)),
}));

describe('BookingOrchestrationService - Idempotency', () => {
  let service: BookingOrchestrationService;
  const { executeIdempotentOperation, hashObject } = require('../src/services/idempotency');

  const mockFlight = {
    id: 'flight-1',
    airlineSorobanAddress: 'GAIRLINE123',
    flightNumber: 'FL123',
    fromAirport: 'JFK',
    toAirport: 'LAX',
    departureTime: new Date(Date.now() + 86400000),
    priceCents: 50000,
    seatsAvailable: 10,
  };

  const mockPassenger = {
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    sorobanAddress: 'GPASSENGER123',
  };

  // Store for tracking created bookings per idempotency key
  const bookingStore = new Map<string, any>();
  const requestHashStore = new Map<string, string>();
  const inFlightLocks = new Map<string, Promise<any>>();

  const flightRepo = {
    findOne: jest.fn().mockResolvedValue(mockFlight),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
  };

  const passengerRepo = {
    create: jest.fn().mockReturnValue({ id: 'passenger-1', ...mockPassenger }),
    save: jest.fn().mockResolvedValue({ id: 'passenger-1', ...mockPassenger }),
  };

  const setupBookingRepoMock = () => {
    const bookingRepo = {
      create: jest.fn().mockImplementation((bookingData: any) => ({
        id: `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ...bookingData,
      })),
      save: jest.fn().mockImplementation((booking: any) => Promise.resolve(booking)),
    };
    require('../src/db/dataSource').AppDataSource.getRepository.mockImplementation((entity: any) => {
      if (entity.name === 'Booking') return bookingRepo;
      if (entity.name === 'Flight') return flightRepo;
      if (entity.name === 'Passenger') return passengerRepo;
      return {};
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    bookingStore.clear();
    requestHashStore.clear();
    inFlightLocks.clear();

    // Default mock for executeIdempotentOperation
    executeIdempotentOperation.mockImplementation(async (params: any) => {
      const key = params.key;
      const requestHash = params.requestHash;
      
      // Check if an execution is already in flight for this key
      if (inFlightLocks.has(key)) {
        const executionResult = await inFlightLocks.get(key);
        const cached = bookingStore.get(key);
        return { result: executionResult, isCached: true, record: { key, resourceId: cached?.id } };
      }
      
      // Check if we have a cached result
      if (bookingStore.has(key)) {
        const cached = bookingStore.get(key);
        const storedHash = requestHashStore.get(key);
        if (storedHash !== requestHash) {
          throw new ConflictError('Idempotency key reuse with different payload');
        }
        return {
          result: cached,
          isCached: true,
          record: { key, resourceId: cached.id },
        };
      }

      // Store the request hash
      requestHashStore.set(key, requestHash);

      // Create the execution promise
      const executionPromise = (async () => {
        try {
          const result = await params.execute();
          bookingStore.set(key, result.result);
          return result.result;
        } finally {
          inFlightLocks.delete(key);
        }
      })();

      inFlightLocks.set(key, executionPromise);
      const executionResult = await executionPromise;
      
      return {
        result: executionResult,
        isCached: false,
        record: { key, resourceId: executionResult.id },
      };
    });

    hashObject.mockImplementation((obj: any) => JSON.stringify(obj));

    setupBookingRepoMock();

    service = new BookingOrchestrationService();
  });

  it('creates a booking with idempotency key', async () => {
    const { signAndSubmitCreateBooking } = require('../src/services/soroban');
    signAndSubmitCreateBooking.mockResolvedValue({
      txHash: 'tx-hash-123',
    });

    const booking = await service.createBooking({
      flightId: 'flight-1',
      passenger: mockPassenger,
      idempotencyKey: 'idem-key-1',
      walletAddress: 'GWALLET123',
    });

    expect(booking).toBeDefined();
    expect(booking.idempotencyKey).toBe('idem-key-1');
    expect(booking.status).toBe('onchain_submitted');
  });

  it('returns cached booking on duplicate idempotency key with same payload', async () => {
    const { signAndSubmitCreateBooking } = require('../src/services/soroban');
    signAndSubmitCreateBooking.mockResolvedValue({
      txHash: 'tx-hash-123',
    });

    const booking1 = await service.createBooking({
      flightId: 'flight-1',
      passenger: mockPassenger,
      idempotencyKey: 'idem-key-2',
      walletAddress: 'GWALLET123',
    });

    const booking2 = await service.createBooking({
      flightId: 'flight-1',
      passenger: mockPassenger,
      idempotencyKey: 'idem-key-2',
      walletAddress: 'GWALLET123',
    });

    expect(booking1.id).toBe(booking2.id);
    expect(booking1.idempotencyKey).toBe('idem-key-2');
    expect(signAndSubmitCreateBooking).toHaveBeenCalledTimes(1);
  });

  it('throws ConflictError when idempotency key is reused with different payload', async () => {
    const { signAndSubmitCreateBooking } = require('../src/services/soroban');
    signAndSubmitCreateBooking.mockResolvedValue({ txHash: 'tx-hash-123' });

    await service.createBooking({
      flightId: 'flight-1',
      passenger: mockPassenger,
      idempotencyKey: 'idem-key-3',
      walletAddress: 'GWALLET123',
    });

    // Try with different passenger data - should throw ConflictError
    const differentPassenger = {
      ...mockPassenger,
      firstName: 'Jane',
    };

    await expect(
      service.createBooking({
        flightId: 'flight-1',
        passenger: differentPassenger,
        idempotencyKey: 'idem-key-3',
        walletAddress: 'GWALLET123',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('handles concurrent requests with same idempotency key', async () => {
    const { signAndSubmitCreateBooking } = require('../src/services/soroban');
    signAndSubmitCreateBooking.mockResolvedValue({ txHash: 'tx-hash-concurrent' });

    const concurrency = 10;
    const promises = Array.from({ length: concurrency }, () =>
      service.createBooking({
        flightId: 'flight-1',
        passenger: mockPassenger,
        idempotencyKey: 'idem-concurrent-key',
        walletAddress: 'GWALLET123',
      }),
    );

    const results = await Promise.all(promises);

    const firstId = results[0].id;
    results.forEach((booking) => {
      expect(booking.id).toBe(firstId);
      expect(booking.idempotencyKey).toBe('idem-concurrent-key');
    });

    expect(signAndSubmitCreateBooking).toHaveBeenCalledTimes(1);
  });

  it('allows different idempotency keys to create different bookings', async () => {
    const { signAndSubmitCreateBooking } = require('../src/services/soroban');
    signAndSubmitCreateBooking.mockResolvedValue({ txHash: 'tx-hash-multi' });

    const bookings = await Promise.all([
      service.createBooking({
        flightId: 'flight-1',
        passenger: mockPassenger,
        idempotencyKey: 'idem-key-a',
        walletAddress: 'GWALLET123',
      }),
      service.createBooking({
        flightId: 'flight-1',
        passenger: mockPassenger,
        idempotencyKey: 'idem-key-b',
        walletAddress: 'GWALLET123',
      }),
      service.createBooking({
        flightId: 'flight-1',
        passenger: mockPassenger,
        idempotencyKey: 'idem-key-c',
        walletAddress: 'GWALLET123',
      }),
    ]);

    expect(bookings).toHaveLength(3);
    const uniqueIds = new Set(bookings.map((b) => b.id));
    expect(uniqueIds.size).toBe(3);
  });
});