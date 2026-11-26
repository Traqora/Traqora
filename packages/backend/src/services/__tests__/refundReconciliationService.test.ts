jest.mock('../../db/entities/Refund', () => ({ Refund: class Refund {} }));

jest.mock('../stripe', () => ({
  stripe: {
    refunds: {
      retrieve: jest.fn(),
    },
  },
}));

jest.mock('../soroban', () => ({
  getTransactionStatus: jest.fn(),
}));

const mockFindOne = jest.fn();
const mockGetMany = jest.fn();
const qb = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getMany: (...args: any[]) => mockGetMany(...args),
};

jest.mock('../../db/dataSource', () => ({
  AppDataSource: {
    getRepository: jest.fn(() => ({
      createQueryBuilder: jest.fn(() => qb),
      findOne: (...args: any[]) => mockFindOne(...args),
    })),
  },
}));

const mockLogAction = jest.fn().mockResolvedValue(undefined);
jest.mock('../refundAuditService', () => ({
  RefundAuditService: {
    getInstance: jest.fn(() => ({
      logAction: (...args: any[]) => mockLogAction(...args),
    })),
  },
}));

import { stripe } from '../stripe';
import { getTransactionStatus } from '../soroban';
import { RefundReconciliationService } from '../refundReconciliationService';

describe('RefundReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RefundReconciliationService as any).instance = undefined;
    qb.leftJoinAndSelect.mockClear().mockReturnThis();
    qb.where.mockClear().mockReturnThis();
    qb.orderBy.mockClear().mockReturnThis();
    qb.take.mockClear().mockReturnThis();
  });

  it('reports matched refunds when provider and internal states align', async () => {
    mockGetMany.mockResolvedValue([
      {
        id: 'r1',
        booking: { id: 'b1' },
        status: 'completed',
        stripeRefundId: 're_1',
        sorobanTxHash: 'tx1',
        approvedAmountCents: 1000,
      },
    ]);
    (stripe.refunds.retrieve as jest.Mock).mockResolvedValue({ id: 're_1', status: 'succeeded' });
    (getTransactionStatus as jest.Mock).mockResolvedValue({ status: 'success', txHash: 'tx1' });

    const service = RefundReconciliationService.getInstance();
    const result = await service.reconcile({ limit: 10 });

    expect(result.scanned).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.mismatched).toBe(0);
    expect(result.findings).toEqual([]);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(mockLogAction).not.toHaveBeenCalled();
  });

  it('detects Stripe/internal and Soroban/internal mismatches and audits findings', async () => {
    mockGetMany.mockResolvedValue([
      {
        id: 'r2',
        booking: { id: 'b2' },
        status: 'processing',
        stripeRefundId: 're_2',
        sorobanTxHash: 'tx2',
        approvedAmountCents: 1000,
      },
    ]);
    (stripe.refunds.retrieve as jest.Mock).mockResolvedValue({ id: 're_2', status: 'succeeded' });
    (getTransactionStatus as jest.Mock).mockResolvedValue({ status: 'failed', txHash: 'tx2', error: 'boom' });

    const service = RefundReconciliationService.getInstance();
    const result = await service.reconcile({ limit: 500 });

    expect(qb.take).toHaveBeenCalledWith(200); // bounded cap
    expect(result.mismatched).toBe(1);
    expect(result.findings[0].mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'stripe_status_mismatch', escalation: 'medium' }),
        expect.objectContaining({ type: 'soroban_status_mismatch', escalation: 'high' }),
      ]),
    );
    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        refundId: 'r2',
        action: 'refund_reconciliation_mismatch',
        actor: 'system:reconciliation',
      }),
    );
  });

  it('detects missing provider identifiers and escalates', async () => {
    mockGetMany.mockResolvedValue([
      {
        id: 'r3',
        booking: { id: 'b3' },
        status: 'onchain_submitted',
        stripeRefundId: null,
        sorobanTxHash: null,
        approvedAmountCents: 500,
      },
    ]);

    const service = RefundReconciliationService.getInstance();
    const result = await service.reconcile({ dryRun: false });

    expect(result.mismatched).toBe(1);
    const types = result.findings[0].mismatches.map((m) => m.type);
    expect(types).toContain('soroban_hash_missing');
    expect(result.findings[0].mismatches.some((m) => m.escalation === 'high')).toBe(true);
  });

  it('records audited operator actions for existing refunds', async () => {
    mockFindOne.mockResolvedValue({ id: 'r4', status: 'manual_review' });
    const service = RefundReconciliationService.getInstance();

    await service.recordOperatorAction({
      refundId: 'r4',
      action: 'escalated',
      actor: 'admin@example.com',
      notes: 'Mismatch confirmed after checking Stripe dashboard',
      nextAction: 'Correct internal status after provider confirmation',
    });

    expect(mockLogAction).toHaveBeenCalledWith(
      expect.objectContaining({
        refundId: 'r4',
        action: 'refund_reconciliation_escalated',
        actor: 'admin@example.com',
      }),
    );
  });
});
