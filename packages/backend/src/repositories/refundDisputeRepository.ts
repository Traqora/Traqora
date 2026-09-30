import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../db/dataSource';
import { Refund, RefundReason, RefundStatus } from '../db/entities/Refund';
import { Dispute, DisputeOutcome, DisputeStatus } from '../db/entities/Dispute';

export const ALL_REFUND_STATUSES: RefundStatus[] = [
  'pending',
  'eligibility_check',
  'approved',
  'rejected',
  'processing',
  'stripe_refunded',
  'onchain_pending',
  'onchain_submitted',
  'completed',
  'failed',
  'manual_review',
  'delayed_pending',
  'delayed_cancelled',
];

export const ALL_DISPUTE_STATUSES: DisputeStatus[] = [
  'open',
  'evidence_submission',
  'under_review',
  'resolved',
  'appealed',
  'closed',
];

export interface RefundSummaryItem {
  id: string;
  bookingId?: string;
  status: RefundStatus;
  reason: RefundReason;
  reasonDetails?: string | null;
  requestedAmountCents: number;
  approvedAmountCents?: number | null;
  processingFeeCents: number;
  isEligible: boolean;
  requiresManualReview: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  requestedBy?: string | null;
  isDelayed: boolean;
  delayedUntil?: string | null;
  emergencyOverride: boolean;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeSummaryItem {
  id: string;
  refundId?: string;
  claimantAddress: string;
  respondentAddress: string;
  arbitratorAddress?: string | null;
  disputeType: string;
  description: string;
  desiredOutcome?: string | null;
  status: DisputeStatus;
  outcome?: DisputeOutcome;
  resolutionNotes?: string | null;
  deadlineAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RefundStatusBucket {
  status: RefundStatus;
  count: number;
  totalRequestedAmountCents: number;
  totalApprovedAmountCents: number;
  recentItems: RefundSummaryItem[];
}

export interface DisputeStatusBucket {
  status: DisputeStatus;
  count: number;
  recentItems: DisputeSummaryItem[];
}

export interface OverviewMetricsSummary {
  totalRefunds: number;
  totalDisputes: number;
  totalRequestedAmountCents: number;
  totalApprovedAmountCents: number;
  pendingRefundsCount: number;
  manualReviewRefundsCount: number;
  openDisputesCount: number;
  activeDisputesCount: number;
}

export interface RefundOverviewSection {
  total: number;
  totalRequestedAmountCents: number;
  totalApprovedAmountCents: number;
  byStatus: Record<RefundStatus, RefundStatusBucket>;
  recent: RefundSummaryItem[];
}

export interface DisputeOverviewSection {
  total: number;
  byStatus: Record<DisputeStatus, DisputeStatusBucket>;
  recent: DisputeSummaryItem[];
}

export interface AdminRefundDisputeOverview {
  metrics: OverviewMetricsSummary;
  refunds: RefundOverviewSection;
  disputes: DisputeOverviewSection;
  timestamp: string;
}

export interface OverviewQueryOptions {
  recentLimit?: number;
  startDate?: Date;
  endDate?: Date;
}

export class RefundDisputeRepository {
  private refundRepo: Repository<Refund>;
  private disputeRepo: Repository<Dispute>;

  constructor(dataSource: DataSource = AppDataSource) {
    this.refundRepo = dataSource.getRepository(Refund);
    this.disputeRepo = dataSource.getRepository(Dispute);
  }

  private mapRefundSummary(refund: Refund): RefundSummaryItem {
    return {
      id: refund.id,
      bookingId: refund.booking?.id,
      status: refund.status,
      reason: refund.reason,
      reasonDetails: refund.reasonDetails ?? null,
      requestedAmountCents: Number(refund.requestedAmountCents) || 0,
      approvedAmountCents: refund.approvedAmountCents != null ? Number(refund.approvedAmountCents) : null,
      processingFeeCents: Number(refund.processingFeeCents) || 0,
      isEligible: Boolean(refund.isEligible),
      requiresManualReview: Boolean(refund.requiresManualReview),
      reviewedBy: refund.reviewedBy ?? null,
      reviewedAt: refund.reviewedAt ? new Date(refund.reviewedAt).toISOString() : null,
      requestedBy: refund.requestedBy ?? null,
      isDelayed: Boolean(refund.isDelayed),
      delayedUntil: refund.delayedUntil ? new Date(refund.delayedUntil).toISOString() : null,
      emergencyOverride: Boolean(refund.emergencyOverride),
      lastError: refund.lastError ?? null,
      createdAt: refund.createdAt ? new Date(refund.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: refund.updatedAt ? new Date(refund.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  private mapDisputeSummary(dispute: Dispute): DisputeSummaryItem {
    return {
      id: dispute.id,
      refundId: dispute.refund?.id,
      claimantAddress: dispute.claimantAddress,
      respondentAddress: dispute.respondentAddress,
      arbitratorAddress: dispute.arbitratorAddress ?? null,
      disputeType: dispute.disputeType,
      description: dispute.description,
      desiredOutcome: dispute.desiredOutcome ?? null,
      status: dispute.status,
      outcome: dispute.outcome ?? null,
      resolutionNotes: dispute.resolutionNotes ?? null,
      deadlineAt: dispute.deadlineAt ? new Date(dispute.deadlineAt).toISOString() : null,
      createdAt: dispute.createdAt ? new Date(dispute.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: dispute.updatedAt ? new Date(dispute.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  public async getRefundOverview(options: OverviewQueryOptions = {}): Promise<RefundOverviewSection> {
    const recentLimit = Math.min(50, Math.max(1, options.recentLimit ?? 5));

    // Initialize all buckets
    const byStatus = ALL_REFUND_STATUSES.reduce((acc, status) => {
      acc[status] = {
        status,
        count: 0,
        totalRequestedAmountCents: 0,
        totalApprovedAmountCents: 0,
        recentItems: [],
      };
      return acc;
    }, {} as Record<RefundStatus, RefundStatusBucket>);

    // Fetch aggregate status counts & sums
    const qb = this.refundRepo.createQueryBuilder('refund');
    if (options.startDate) {
      qb.andWhere('refund.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      qb.andWhere('refund.createdAt <= :endDate', { endDate: options.endDate });
    }

    const rawAggs = await qb
      .select('refund.status', 'status')
      .addSelect('COUNT(refund.id)', 'count')
      .addSelect('SUM(refund.requestedAmountCents)', 'totalRequested')
      .addSelect('SUM(COALESCE(refund.approvedAmountCents, 0))', 'totalApproved')
      .groupBy('refund.status')
      .getRawMany();

    let total = 0;
    let totalRequestedAmountCents = 0;
    let totalApprovedAmountCents = 0;

    for (const row of rawAggs) {
      const status = row.status as RefundStatus;
      const count = parseInt(String(row.count ?? '0'), 10);
      const reqSum = parseInt(String(row.totalRequested ?? '0'), 10);
      const appSum = parseInt(String(row.totalApproved ?? '0'), 10);

      if (byStatus[status]) {
        byStatus[status].count = count;
        byStatus[status].totalRequestedAmountCents = reqSum;
        byStatus[status].totalApprovedAmountCents = appSum;
      }

      total += count;
      totalRequestedAmountCents += reqSum;
      totalApprovedAmountCents += appSum;
    }

    // Fetch overall recent items
    const recentQb = this.refundRepo.createQueryBuilder('refund')
      .leftJoinAndSelect('refund.booking', 'booking')
      .orderBy('refund.createdAt', 'DESC')
      .take(recentLimit);

    if (options.startDate) {
      recentQb.andWhere('refund.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      recentQb.andWhere('refund.createdAt <= :endDate', { endDate: options.endDate });
    }

    const recentEntities = await recentQb.getMany();
    const recent = recentEntities.map((r) => this.mapRefundSummary(r));

    // Fetch recent items for populated buckets
    for (const status of ALL_REFUND_STATUSES) {
      if (byStatus[status].count > 0) {
        const bucketQb = this.refundRepo.createQueryBuilder('refund')
          .leftJoinAndSelect('refund.booking', 'booking')
          .where('refund.status = :status', { status })
          .orderBy('refund.createdAt', 'DESC')
          .take(recentLimit);

        if (options.startDate) {
          bucketQb.andWhere('refund.createdAt >= :startDate', { startDate: options.startDate });
        }
        if (options.endDate) {
          bucketQb.andWhere('refund.createdAt <= :endDate', { endDate: options.endDate });
        }

        const bucketEntities = await bucketQb.getMany();
        byStatus[status].recentItems = bucketEntities.map((r) => this.mapRefundSummary(r));
      }
    }

    return {
      total,
      totalRequestedAmountCents,
      totalApprovedAmountCents,
      byStatus,
      recent,
    };
  }

  public async getDisputeOverview(options: OverviewQueryOptions = {}): Promise<DisputeOverviewSection> {
    const recentLimit = Math.min(50, Math.max(1, options.recentLimit ?? 5));

    // Initialize all buckets
    const byStatus = ALL_DISPUTE_STATUSES.reduce((acc, status) => {
      acc[status] = {
        status,
        count: 0,
        recentItems: [],
      };
      return acc;
    }, {} as Record<DisputeStatus, DisputeStatusBucket>);

    // Fetch aggregate dispute status counts
    const qb = this.disputeRepo.createQueryBuilder('dispute');
    if (options.startDate) {
      qb.andWhere('dispute.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      qb.andWhere('dispute.createdAt <= :endDate', { endDate: options.endDate });
    }

    const rawAggs = await qb
      .select('dispute.status', 'status')
      .addSelect('COUNT(dispute.id)', 'count')
      .groupBy('dispute.status')
      .getRawMany();

    let total = 0;
    for (const row of rawAggs) {
      const status = row.status as DisputeStatus;
      const count = parseInt(String(row.count ?? '0'), 10);
      if (byStatus[status]) {
        byStatus[status].count = count;
      }
      total += count;
    }

    // Fetch overall recent disputes
    const recentQb = this.disputeRepo.createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.refund', 'refund')
      .orderBy('dispute.createdAt', 'DESC')
      .take(recentLimit);

    if (options.startDate) {
      recentQb.andWhere('dispute.createdAt >= :startDate', { startDate: options.startDate });
    }
    if (options.endDate) {
      recentQb.andWhere('dispute.createdAt <= :endDate', { endDate: options.endDate });
    }

    const recentEntities = await recentQb.getMany();
    const recent = recentEntities.map((d) => this.mapDisputeSummary(d));

    // Fetch recent items for populated buckets
    for (const status of ALL_DISPUTE_STATUSES) {
      if (byStatus[status].count > 0) {
        const bucketQb = this.disputeRepo.createQueryBuilder('dispute')
          .leftJoinAndSelect('dispute.refund', 'refund')
          .where('dispute.status = :status', { status })
          .orderBy('dispute.createdAt', 'DESC')
          .take(recentLimit);

        if (options.startDate) {
          bucketQb.andWhere('dispute.createdAt >= :startDate', { startDate: options.startDate });
        }
        if (options.endDate) {
          bucketQb.andWhere('dispute.createdAt <= :endDate', { endDate: options.endDate });
        }

        const bucketEntities = await bucketQb.getMany();
        byStatus[status].recentItems = bucketEntities.map((d) => this.mapDisputeSummary(d));
      }
    }

    return {
      total,
      byStatus,
      recent,
    };
  }

  public async getOverview(options: OverviewQueryOptions = {}): Promise<AdminRefundDisputeOverview> {
    const [refunds, disputes] = await Promise.all([
      this.getRefundOverview(options),
      this.getDisputeOverview(options),
    ]);

    const pendingStatuses: RefundStatus[] = [
      'pending',
      'eligibility_check',
      'processing',
      'onchain_pending',
      'delayed_pending',
    ];
    const pendingRefundsCount = pendingStatuses.reduce(
      (sum, s) => sum + (refunds.byStatus[s]?.count ?? 0),
      0
    );

    const manualReviewRefundsCount = refunds.byStatus['manual_review']?.count ?? 0;

    const openDisputesCount = disputes.byStatus['open']?.count ?? 0;
    const activeDisputeStatuses: DisputeStatus[] = ['open', 'evidence_submission', 'under_review', 'appealed'];
    const activeDisputesCount = activeDisputeStatuses.reduce(
      (sum, s) => sum + (disputes.byStatus[s]?.count ?? 0),
      0
    );

    const metrics: OverviewMetricsSummary = {
      totalRefunds: refunds.total,
      totalDisputes: disputes.total,
      totalRequestedAmountCents: refunds.totalRequestedAmountCents,
      totalApprovedAmountCents: refunds.totalApprovedAmountCents,
      pendingRefundsCount,
      manualReviewRefundsCount,
      openDisputesCount,
      activeDisputesCount,
    };

    return {
      metrics,
      refunds,
      disputes,
      timestamp: new Date().toISOString(),
    };
  }
}

let repositoryInstance: RefundDisputeRepository | null = null;

export function getRefundDisputeRepository(): RefundDisputeRepository {
  if (!repositoryInstance) {
    repositoryInstance = new RefundDisputeRepository();
  }
  return repositoryInstance;
}
