import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import {
  RefundDisputeRepository,
  ALL_REFUND_STATUSES,
  ALL_DISPUTE_STATUSES,
} from '../src/repositories/refundDisputeRepository';
import { Refund } from '../src/db/entities/Refund';
import { Dispute } from '../src/db/entities/Dispute';

describe('RefundDisputeRepository Unit Tests', () => {
  let mockRefundRepo: Partial<Repository<Refund>>;
  let mockDisputeRepo: Partial<Repository<Dispute>>;
  let mockDataSource: DataSource;
  let repository: RefundDisputeRepository;

  const createMockRefundQueryBuilder = (refunds: Partial<Refund>[] = [], rawAggs: any[] = []) => {
    let currentStatusFilter: string | null = null;

    const qb: any = {
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation((condition: string, params: any) => {
        if (params?.status) {
          currentStatusFilter = params.status;
        }
        return qb;
      }),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockImplementation(async () => {
        return rawAggs;
      }),
      getMany: jest.fn().mockImplementation(async () => {
        if (currentStatusFilter) {
          return refunds.filter((r) => r.status === currentStatusFilter);
        }
        return refunds;
      }),
    };
    return qb;
  };

  const createMockDisputeQueryBuilder = (disputes: Partial<Dispute>[] = [], rawAggs: any[] = []) => {
    let currentStatusFilter: string | null = null;

    const qb: any = {
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation((condition: string, params: any) => {
        if (params?.status) {
          currentStatusFilter = params.status;
        }
        return qb;
      }),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockImplementation(async () => {
        return rawAggs;
      }),
      getMany: jest.fn().mockImplementation(async () => {
        if (currentStatusFilter) {
          return disputes.filter((d) => d.status === currentStatusFilter);
        }
        return disputes;
      }),
    };
    return qb;
  };

  beforeEach(() => {
    mockRefundRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockRefundQueryBuilder([], [])),
    };
    mockDisputeRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(createMockDisputeQueryBuilder([], [])),
    };

    mockDataSource = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === Refund) return mockRefundRepo as Repository<Refund>;
        if (entity === Dispute) return mockDisputeRepo as Repository<Dispute>;
        return {} as any;
      }),
    } as unknown as DataSource;

    repository = new RefundDisputeRepository(mockDataSource);
  });

  it('initializes all refund and dispute status buckets with 0 count when DB is empty', async () => {
    const overview = await repository.getOverview();

    expect(overview.metrics.totalRefunds).toBe(0);
    expect(overview.metrics.totalDisputes).toBe(0);
    expect(overview.metrics.totalRequestedAmountCents).toBe(0);
    expect(overview.metrics.totalApprovedAmountCents).toBe(0);
    expect(overview.metrics.pendingRefundsCount).toBe(0);
    expect(overview.metrics.openDisputesCount).toBe(0);

    // All 13 refund statuses are present
    expect(Object.keys(overview.refunds.byStatus)).toHaveLength(ALL_REFUND_STATUSES.length);
    for (const status of ALL_REFUND_STATUSES) {
      expect(overview.refunds.byStatus[status]).toBeDefined();
      expect(overview.refunds.byStatus[status].count).toBe(0);
      expect(overview.refunds.byStatus[status].totalRequestedAmountCents).toBe(0);
      expect(overview.refunds.byStatus[status].totalApprovedAmountCents).toBe(0);
      expect(overview.refunds.byStatus[status].recentItems).toEqual([]);
    }

    // All 6 dispute statuses are present
    expect(Object.keys(overview.disputes.byStatus)).toHaveLength(ALL_DISPUTE_STATUSES.length);
    for (const status of ALL_DISPUTE_STATUSES) {
      expect(overview.disputes.byStatus[status]).toBeDefined();
      expect(overview.disputes.byStatus[status].count).toBe(0);
      expect(overview.disputes.byStatus[status].recentItems).toEqual([]);
    }

    expect(overview.refunds.recent).toEqual([]);
    expect(overview.disputes.recent).toEqual([]);
    expect(overview.timestamp).toBeDefined();
  });

  it('aggregates refund counts, amounts, and recent items grouped by status', async () => {
    const mockRefunds: Partial<Refund>[] = [
      {
        id: 'ref-1',
        status: 'pending',
        reason: 'flight_cancelled',
        requestedAmountCents: 15000,
        approvedAmountCents: null,
        processingFeeCents: 0,
        isEligible: true,
        requiresManualReview: false,
        isDelayed: false,
        emergencyOverride: false,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
      },
      {
        id: 'ref-2',
        status: 'pending',
        reason: 'flight_delayed',
        requestedAmountCents: 20000,
        approvedAmountCents: null,
        processingFeeCents: 500,
        isEligible: true,
        requiresManualReview: false,
        isDelayed: false,
        emergencyOverride: false,
        createdAt: new Date('2026-08-02T10:00:00.000Z'),
        updatedAt: new Date('2026-08-02T10:00:00.000Z'),
      },
      {
        id: 'ref-3',
        status: 'approved',
        reason: 'customer_request',
        requestedAmountCents: 35000,
        approvedAmountCents: 35000,
        processingFeeCents: 0,
        isEligible: true,
        requiresManualReview: false,
        isDelayed: false,
        emergencyOverride: false,
        createdAt: new Date('2026-08-03T10:00:00.000Z'),
        updatedAt: new Date('2026-08-03T10:00:00.000Z'),
      },
      {
        id: 'ref-4',
        status: 'manual_review',
        reason: 'other',
        reasonDetails: 'Requires supervisor sign-off',
        requestedAmountCents: 50000,
        approvedAmountCents: null,
        processingFeeCents: 0,
        isEligible: false,
        requiresManualReview: true,
        isDelayed: false,
        emergencyOverride: false,
        createdAt: new Date('2026-08-04T10:00:00.000Z'),
        updatedAt: new Date('2026-08-04T10:00:00.000Z'),
      },
    ];

    const rawAggs = [
      { status: 'pending', count: '2', totalRequested: '35000', totalApproved: '0' },
      { status: 'approved', count: '1', totalRequested: '35000', totalApproved: '35000' },
      { status: 'manual_review', count: '1', totalRequested: '50000', totalApproved: '0' },
    ];

    (mockRefundRepo.createQueryBuilder as jest.Mock).mockImplementation(() =>
      createMockRefundQueryBuilder(mockRefunds, rawAggs),
    );

    const overview = await repository.getRefundOverview({ recentLimit: 5 });

    expect(overview.total).toBe(4);
    expect(overview.totalRequestedAmountCents).toBe(120000);
    expect(overview.totalApprovedAmountCents).toBe(35000);

    expect(overview.byStatus['pending'].count).toBe(2);
    expect(overview.byStatus['pending'].totalRequestedAmountCents).toBe(35000);
    expect(overview.byStatus['pending'].recentItems).toHaveLength(2);

    expect(overview.byStatus['approved'].count).toBe(1);
    expect(overview.byStatus['approved'].totalApprovedAmountCents).toBe(35000);
    expect(overview.byStatus['approved'].recentItems).toHaveLength(1);

    expect(overview.byStatus['manual_review'].count).toBe(1);
    expect(overview.byStatus['manual_review'].recentItems[0].requiresManualReview).toBe(true);

    expect(overview.recent).toHaveLength(4);
  });

  it('aggregates dispute counts and recent items grouped by status', async () => {
    const mockDisputes: Partial<Dispute>[] = [
      {
        id: 'disp-1',
        claimantAddress: 'GA1111111111111111111111111111111111111111111111111111111111',
        respondentAddress: 'GA2222222222222222222222222222222222222222222222222222222222',
        disputeType: 'refund_denied',
        description: 'Passenger flight was cancelled but refund denied',
        desiredOutcome: 'Full refund',
        status: 'open',
        createdAt: new Date('2026-08-10T10:00:00.000Z'),
        updatedAt: new Date('2026-08-10T10:00:00.000Z'),
      },
      {
        id: 'disp-2',
        claimantAddress: 'GA3333333333333333333333333333333333333333333333333333333333',
        respondentAddress: 'GA4444444444444444444444444444444444444444444444444444444444',
        disputeType: 'service_quality',
        description: 'Seat malfunction during flight',
        desiredOutcome: 'Partial compensation',
        status: 'under_review',
        arbitratorAddress: 'GA_ARBITRATOR',
        createdAt: new Date('2026-08-11T10:00:00.000Z'),
        updatedAt: new Date('2026-08-11T10:00:00.000Z'),
      },
      {
        id: 'disp-3',
        claimantAddress: 'GA5555555555555555555555555555555555555555555555555555555555',
        respondentAddress: 'GA6666666666666666666666666666666666666666666666666666666666',
        disputeType: 'refund_amount',
        description: 'Incorrect fee deducted',
        status: 'resolved',
        outcome: 'claimant_wins',
        resolutionNotes: 'Fee refund issued to claimant',
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
        updatedAt: new Date('2026-08-12T10:00:00.000Z'),
      },
    ];

    const rawAggs = [
      { status: 'open', count: '1' },
      { status: 'under_review', count: '1' },
      { status: 'resolved', count: '1' },
    ];

    (mockDisputeRepo.createQueryBuilder as jest.Mock).mockImplementation(() =>
      createMockDisputeQueryBuilder(mockDisputes, rawAggs),
    );

    const overview = await repository.getDisputeOverview({ recentLimit: 5 });

    expect(overview.total).toBe(3);
    expect(overview.byStatus['open'].count).toBe(1);
    expect(overview.byStatus['open'].recentItems).toHaveLength(1);
    expect(overview.byStatus['open'].recentItems[0].disputeType).toBe('refund_denied');

    expect(overview.byStatus['under_review'].count).toBe(1);
    expect(overview.byStatus['under_review'].recentItems[0].arbitratorAddress).toBe('GA_ARBITRATOR');

    expect(overview.byStatus['resolved'].count).toBe(1);
    expect(overview.byStatus['resolved'].recentItems[0].outcome).toBe('claimant_wins');

    expect(overview.recent).toHaveLength(3);
  });

  it('calculates comprehensive overview metrics across refunds and disputes', async () => {
    const rawRefundAggs = [
      { status: 'pending', count: '3', totalRequested: '30000', totalApproved: '0' },
      { status: 'manual_review', count: '2', totalRequested: '40000', totalApproved: '0' },
      { status: 'approved', count: '5', totalRequested: '100000', totalApproved: '95000' },
    ];

    const rawDisputeAggs = [
      { status: 'open', count: '4' },
      { status: 'evidence_submission', count: '2' },
      { status: 'under_review', count: '1' },
      { status: 'resolved', count: '10' },
    ];

    (mockRefundRepo.createQueryBuilder as jest.Mock).mockImplementation(() =>
      createMockRefundQueryBuilder([], rawRefundAggs),
    );
    (mockDisputeRepo.createQueryBuilder as jest.Mock).mockImplementation(() =>
      createMockDisputeQueryBuilder([], rawDisputeAggs),
    );

    const overview = await repository.getOverview();

    expect(overview.metrics.totalRefunds).toBe(10);
    expect(overview.metrics.totalDisputes).toBe(17);
    expect(overview.metrics.totalRequestedAmountCents).toBe(170000);
    expect(overview.metrics.totalApprovedAmountCents).toBe(95000);
    expect(overview.metrics.pendingRefundsCount).toBe(3);
    expect(overview.metrics.manualReviewRefundsCount).toBe(2);
    expect(overview.metrics.openDisputesCount).toBe(4);
    expect(overview.metrics.activeDisputesCount).toBe(7); // open (4) + evidence_submission (2) + under_review (1)
  });
});
