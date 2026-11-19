jest.mock('../src/db/entities/Booking', () => ({ BookingStatus: {} }));
jest.mock('../src/db/entities/ContractReconciliationAttempt', () => ({}));
jest.mock('../src/db/dataSource', () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

import { toOperationsRow } from '../src/api/routes/admin/operations';

function booking(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'booking-1',
    bookingReference: 'TQ-ABC123',
    status: 'confirmed',
    amountCents: 42000,
    stripePaymentIntentId: 'pi_123',
    sorobanTxHash: null,
    flight: {
      flightNumber: 'TQ204',
      status: 'DELAYED',
      departureTime: new Date('2026-12-01T10:00:00.000Z'),
    },
    updatedAt: new Date('2026-11-19T09:00:00.000Z'),
    ...overrides,
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
      reconciliationStatus: 'repaired',
      reconciliationDetail: null,
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
    expect(row.flightNumber).toBe('unavailable');
    expect(row.departureTime).toBe('unavailable');
    expect(row.paymentReference).toBeNull();
    expect(row.bookingReference).toBeNull();
    expect(row.reconciliationStatus).toBe('not_attempted');
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

    expect(toOperationsRow(booking(), { outcome: 'future_outcome' } as any).reconciliationStatus)
      .toBe('needs_review');
  });
});
