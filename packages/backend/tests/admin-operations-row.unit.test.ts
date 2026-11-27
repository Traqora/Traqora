jest.mock('../src/db/entities/Booking', () => ({ BookingStatus: {} }));
jest.mock('../src/db/entities/ContractEventLog', () => ({}));
jest.mock('../src/db/entities/ContractReconciliationAttempt', () => ({}));
jest.mock('../src/db/dataSource', () => ({
  AppDataSource: { getRepository: jest.fn() },
}));
jest.mock('../src/utils/errorHandler', () => ({
  asyncHandler: (handler: unknown) => handler,
}));

import {
  summarizeOperationsRows,
  toOperationsRow,
} from '../src/api/routes/admin/operations';

function booking(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'booking-1',
    bookingReference: 'TQ-ABC123',
    status: 'confirmed',
    amountCents: 42000,
    stripePaymentIntentId: 'pi_123',
    sorobanTxHash: null,
    sorobanBookingId: 'soroban-1',
    flight: {
      flightNumber: 'TQ204',
      status: 'DELAYED',
      syncStatus: 'EXACT_MATCH',
      departureTime: new Date('2026-12-01T10:00:00.000Z'),
    },
    updatedAt: new Date('2026-11-19T09:00:00.000Z'),
    ...overrides,
  };
}

function contractEvent(eventType: string): any {
  return {
    id: 'event-1',
    contractId: 'contract-1',
    eventType,
    ledger: 100,
    sorobanBookingId: 'soroban-1',
    indexedAt: new Date('2026-11-19T09:00:00.000Z'),
  };
}

describe('toOperationsRow', () => {
  it('maps authoritative booking, supplier, payment and reconciliation state', () => {
    const row = toOperationsRow(booking(), {
      outcome: 'repaired',
      error: null,
    } as any);

    expect(row).toEqual({
      bookingId: 'booking-1',
      bookingReference: 'TQ-ABC123',
      bookingState: 'confirmed',
      supplierState: 'DELAYED',
      paymentReference: 'pi_123',
      contractState: 'unavailable',
      reconciliationStatus: 'repaired',
      reconciliationDetail: null,
      mismatches: [],
      flightNumber: 'TQ204',
      departureTime: '2026-12-01T10:00:00.000Z',
      amountCents: 42000,
      updatedAt: '2026-11-19T09:00:00.000Z',
    });
  });

  it('reports unavailable instead of inventing supplier or payment state', () => {
    const row = toOperationsRow(
      booking({
        flight: null,
        stripePaymentIntentId: null,
        sorobanTxHash: null,
        bookingReference: null,
      })
    );

    expect(row.supplierState).toBe('unavailable');
    expect(row.contractState).toBe('unavailable');
    expect(row.flightNumber).toBe('unavailable');
    expect(row.departureTime).toBe('unavailable');
    expect(row.paymentReference).toBeNull();
    expect(row.bookingReference).toBeNull();
    expect(row.reconciliationStatus).toBe('not_attempted');
    expect(row.mismatches).toEqual([
      expect.objectContaining({ type: 'payment_reference_missing', severity: 'high' }),
    ]);
  });

  it('falls back to the on-chain hash for the payment reference', () => {
    const row = toOperationsRow(booking({ stripePaymentIntentId: null, sorobanTxHash: 'tx-hash' }));
    expect(row.paymentReference).toBe('tx-hash');
  });

  it('maps detected, failed and unknown reconciliation outcomes', () => {
    expect(toOperationsRow(booking(), { outcome: 'detected', error: null } as any).reconciliationStatus)
      .toBe('detected');

    const failed = toOperationsRow(booking(), {
      outcome: 'failed',
      error: 'Ledger mismatch',
    } as any);
    expect(failed.reconciliationStatus).toBe('needs_review');
    expect(failed.reconciliationDetail).toBe('Ledger mismatch');
    expect(failed.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'reconciliation_failed', severity: 'high' }),
      ]),
    );

    expect(toOperationsRow(booking(), { outcome: 'future_outcome' } as any).reconciliationStatus)
      .toBe('needs_review');
  });
});

describe('booking reconciliation mismatches', () => {
  it('flags a contract event that disagrees with backend state', () => {
    const row = toOperationsRow(booking(), undefined, contractEvent('refunded'));

    expect(row.contractState).toBe('refunded');
    expect(row.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'contract_backend_mismatch',
          severity: 'high',
          detail: 'Contract expects refunded but backend is confirmed',
        }),
      ]),
    );
  });

  it('does not flag matching contract state or unsupported contract events', () => {
    expect(toOperationsRow(booking(), undefined, contractEvent('released')).mismatches).toEqual([]);
    expect(toOperationsRow(booking(), undefined, contractEvent('unknown')).mismatches).toEqual([]);
  });

  it('flags supplier cancellation while the backend booking remains active', () => {
    const row = toOperationsRow(booking({
      flight: {
        flightNumber: 'TQ204',
        status: 'CANCELLED',
        syncStatus: 'EXACT_MATCH',
        departureTime: new Date('2026-12-01T10:00:00.000Z'),
      },
    }));

    expect(row.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'supplier_backend_mismatch', severity: 'high' }),
      ]),
    );
  });

  it('flags supplier sync conflicts and unresolved payment references', () => {
    const conflict = toOperationsRow(booking({
      flight: {
        flightNumber: 'TQ204',
        status: 'DELAYED',
        syncStatus: 'CONFLICT',
        departureTime: new Date('2026-12-01T10:00:00.000Z'),
      },
    }));
    expect(conflict.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'supplier_sync_conflict', severity: 'medium' }),
      ]),
    );

    const failedWithPayment = toOperationsRow(booking({ status: 'failed' }));
    expect(failedWithPayment.mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'payment_state_unresolved', severity: 'medium' }),
      ]),
    );
  });
});

describe('summarizeOperationsRows', () => {
  it('counts mismatched bookings, types and severities', () => {
    const clean = toOperationsRow(booking());
    const contractMismatch = toOperationsRow(booking(), undefined, contractEvent('refunded'));
    const failed = toOperationsRow(booking(), { outcome: 'failed', error: 'Ledger mismatch' } as any);

    expect(summarizeOperationsRows([clean, contractMismatch, failed])).toEqual({
      scannedBookings: 3,
      mismatchedBookings: 2,
      mismatchCount: 2,
      byType: {
        contract_backend_mismatch: 1,
        reconciliation_failed: 1,
      },
      bySeverity: { high: 2, medium: 0, low: 0 },
    });
  });
});
