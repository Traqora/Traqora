/**
 * Regression coverage for #934: identify bookings whose persisted status
 * disagrees with authoritative indexed contract events, repair them, and
 * record every attempt (including failures).
 */

import {
  BOOKING_EVENT_STATUS,
  ContractEventSource,
  IndexedContractEvent,
  ReconciliationAttemptStore,
  ReconciliationBooking,
  ReconciliationBookingStore,
  RepairAttemptInput,
  expectedStatusForEventType,
  reconcileContractBookingStates,
  selectLatestAuthoritativeEvents,
} from '../../src/services/contractBookingReconciliation';

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const indexedEvent = (
  sorobanBookingId: string,
  eventType: string,
  ledger: number,
  id = `${sorobanBookingId}-${ledger}`,
): IndexedContractEvent => ({
  id,
  contractId: 'CBOOKING',
  eventType,
  ledger,
  sorobanBookingId,
});

const makeStores = (bookings: ReconciliationBooking[]) => {
  const saved: Array<{ bookingId: string; status: string }> = [];
  const attempts: RepairAttemptInput[] = [];

  const eventSource: ContractEventSource = {
    listAuthoritativeEvents: jest.fn(async () => []),
  };

  const bookingStore: ReconciliationBookingStore = {
    findBySorobanBookingIds: jest.fn(async () => bookings),
    saveStatus: jest.fn(async (bookingId, status) => {
      saved.push({ bookingId, status });
    }),
  };

  const attemptStore: ReconciliationAttemptStore = {
    record: jest.fn(async (attempt) => {
      attempts.push(attempt);
    }),
  };

  return { eventSource, bookingStore, attemptStore, saved, attempts };
};

const withEvents = (
  eventSource: ContractEventSource,
  events: IndexedContractEvent[],
): ContractEventSource => ({
  ...eventSource,
  listAuthoritativeEvents: jest.fn(async () => events),
});

describe('expectedStatusForEventType', () => {
  it('maps booking and refund lifecycle events case-insensitively', () => {
    expect(BOOKING_EVENT_STATUS.created).toBe('onchain_submitted');
    expect(expectedStatusForEventType('created')).toBe('onchain_submitted');
    expect(expectedStatusForEventType('Released')).toBe('confirmed');
    expect(expectedStatusForEventType('RefundProcessed')).toBe('refunded');
  });

  it('ignores events that do not describe booking state', () => {
    expect(expectedStatusForEventType('DisputeCreated')).toBeNull();
    expect(expectedStatusForEventType(null)).toBeNull();
  });
});

describe('selectLatestAuthoritativeEvents', () => {
  it('keeps the highest-ledger event per booking', () => {
    const latest = selectLatestAuthoritativeEvents([
      indexedEvent('42', 'paid', 10),
      indexedEvent('42', 'released', 12),
      indexedEvent('43', 'created', 9),
    ]);

    expect(latest.get('42')?.eventType).toBe('released');
    expect(latest.get('43')?.eventType).toBe('created');
  });
});

describe('reconcileContractBookingStates', () => {
  it('repairs a mismatched booking and records the attempt (#934)', async () => {
    const stores = makeStores([
      { id: 'booking-uuid', status: 'created', sorobanBookingId: '42' },
    ]);
    const eventSource = withEvents(stores.eventSource, [
      indexedEvent('42', 'paid', 15),
    ]);

    const summary = await reconcileContractBookingStates({
      eventSource,
      bookings: stores.bookingStore,
      attempts: stores.attemptStore,
    });

    expect(summary).toMatchObject({
      mismatches: 1,
      repaired: 1,
      failed: 0,
      unchanged: 0,
      skipped: 0,
    });
    expect(stores.bookingStore.saveStatus).toHaveBeenCalledWith(
      'booking-uuid',
      'paid',
    );
    expect(stores.saved).toEqual([{ bookingId: 'booking-uuid', status: 'paid' }]);
    expect(stores.attempts).toEqual([
      expect.objectContaining({
        bookingId: 'booking-uuid',
        sorobanBookingId: '42',
        previousStatus: 'created',
        expectedStatus: 'paid',
        eventLedger: 15,
        outcome: 'repaired',
        error: null,
      }),
    ]);
  });

  it('records a failed repair attempt and keeps going (#934 failure case)', async () => {
    const stores = makeStores([
      { id: 'booking-a', status: 'paid', sorobanBookingId: '42' },
      { id: 'booking-b', status: 'created', sorobanBookingId: '43' },
    ]);
    const eventSource = withEvents(stores.eventSource, [
      indexedEvent('42', 'refunded', 20),
      indexedEvent('43', 'paid', 21),
    ]);

    (stores.bookingStore.saveStatus as jest.Mock)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce(undefined);

    const summary = await reconcileContractBookingStates({
      eventSource,
      bookings: stores.bookingStore,
      attempts: stores.attemptStore,
    });

    expect(summary.mismatches).toBe(2);
    expect(summary.repaired).toBe(1);
    expect(summary.failed).toBe(1);
    expect(stores.attempts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: 'booking-a',
          outcome: 'failed',
          expectedStatus: 'refunded',
          error: 'database unavailable',
        }),
        expect.objectContaining({
          bookingId: 'booking-b',
          outcome: 'repaired',
          expectedStatus: 'paid',
        }),
      ]),
    );
  });

  it('does nothing when persisted state already matches the chain', async () => {
    const stores = makeStores([
      { id: 'booking-uuid', status: 'confirmed', sorobanBookingId: '42' },
    ]);
    const eventSource = withEvents(stores.eventSource, [
      indexedEvent('42', 'released', 30),
    ]);

    const summary = await reconcileContractBookingStates({
      eventSource,
      bookings: stores.bookingStore,
      attempts: stores.attemptStore,
    });

    expect(summary).toMatchObject({
      mismatches: 0,
      repaired: 0,
      unchanged: 1,
    });
    expect(stores.bookingStore.saveStatus).not.toHaveBeenCalled();
    expect(stores.attempts).toHaveLength(0);
  });

  it('detects mismatches in dry-run mode without writing state or attempts', async () => {
    const stores = makeStores([
      { id: 'booking-uuid', status: 'created', sorobanBookingId: '42' },
    ]);
    const eventSource = withEvents(stores.eventSource, [
      indexedEvent('42', 'paid', 30),
    ]);

    const summary = await reconcileContractBookingStates({
      eventSource,
      bookings: stores.bookingStore,
      attempts: stores.attemptStore,
      dryRun: true,
    });

    expect(summary).toMatchObject({ dryRun: true, mismatches: 1, repaired: 0 });
    expect(stores.bookingStore.saveStatus).not.toHaveBeenCalled();
    expect(stores.attempts).toHaveLength(0);
  });

  it('skips indexed bookings that have no backend row', async () => {
    const stores = makeStores([]);
    const eventSource = withEvents(stores.eventSource, [
      indexedEvent('missing', 'paid', 30),
    ]);

    const summary = await reconcileContractBookingStates({
      eventSource,
      bookings: stores.bookingStore,
      attempts: stores.attemptStore,
    });

    expect(summary.skipped).toBe(1);
    expect(summary.mismatches).toBe(0);
    expect(stores.bookingStore.saveStatus).not.toHaveBeenCalled();
  });
});
